const { DynamicStructuredTool } = require('@langchain/core/tools');
const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');
const { ChatOpenAI } = require('@langchain/openai');
const { AIMessage, HumanMessage, SystemMessage, ToolMessage } = require('@langchain/core/messages');
const z = require('zod');
const { log, logErr } = require('./logger');
const { createToolsFromSchemas, generateAndExecuteAdhoc, getToolCallDescription } = require('./tools');
const { getMessagesWithinContextLimit } = require('./context-manager');
const { TASK_TOOL_SCHEMAS, COMPLETION_PROMPT_TEXT } = require('../constants');
const { calculateCost } = require('./pricing');

// Create tools from schemas
const taskTools = createToolsFromSchemas(TASK_TOOL_SCHEMAS);

// Read the API key and model from environment variables
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;

if (!apiKey) {
  throw new Error("OPENAI_API_KEY environment variable is not set");
}

if (!model) {
  throw new Error("OPENAI_MODEL environment variable is not set");
}

const completionTools = [
  new DynamicStructuredTool({
    name: 'run_adhoc_task',
    description: 'A tool for an agent to run custom tasks described in natural language',
    schema: z.object({
      description: z.string(),
    }),
    func: async ({ description }, streamWriter) => {
      try {
        const result = await generateAndExecuteAdhoc(description, streamWriter);
        return typeof result === 'object' ? JSON.stringify(result) : String(result);
      } catch (error) {
        return `Error during execution: ${error.message}`;
      }
    },
    returnDirect: false,
  }),
  ...taskTools
];

const completionPrompt = ChatPromptTemplate.fromMessages(
  [
    new SystemMessage(COMPLETION_PROMPT_TEXT),
    new MessagesPlaceholder("conversation")
  ]
);

async function processToolCalls(toolCalls, streamWriter) {
  const toolMessages = [
    new AIMessage({
      content: '',
      additional_kwargs: { tool_calls: toolCalls }
    })
  ];

  for (const toolCall of toolCalls) {
    const tool = completionTools.find(t => t.name === toolCall.function.name);

    console.warn("Calling tool:", toolCall.function.name, toolCall.function.arguments);

    if (tool) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        const toolCallDescription = getToolCallDescription(toolCall.function.name, args);

        if (toolCallDescription && streamWriter && streamWriter.writeEvent) {
          streamWriter.writeEvent(toolCallDescription, model);
        }

        const toolResult = await tool.func(args, streamWriter);

        console.warn("Tool result:", toolResult);
        toolMessages.push(new ToolMessage({
          content: JSON.stringify({
            type: "tool_result",
            result: toolResult
          }),
          name: toolCall.function.name,
          tool_call_id: toolCall.id,
        }));
      } catch (error) {
        const errorMessage = `Error in tool '${toolCall.function.name}': ${error.message}`;
        console.warn("Error in tool:", errorMessage);
        toolMessages.push(new ToolMessage({
          content: JSON.stringify({
            type: "tool_result",
            result: { error: errorMessage }
          }),
          name: toolCall.function.name,
          tool_call_id: toolCall.id,
        }));
      }
    } else {
      console.warn("Tool not found:", toolCall.function.name);
      toolMessages.push(new ToolMessage({
        content: JSON.stringify({
          type: "tool_result",
          result: { error: "Tool not found" }
        }),
        name: toolCall.function.name,
        tool_call_id: toolCall.id,
      }));
    }
  }
  return toolMessages;
}

async function getConversationFromMessagesRequest(messages) {
  let truncatedMessages = await getMessagesWithinContextLimit(model, messages);

  if (process.env.STRIP_CONSECUTIVE_USER_MSGS == "true") {
    const filteredMessages = [];
    let prevRole = null;

    // Remove consecutive user messages
    for (const msg of truncatedMessages) {
      if (msg.role === 'user') {
        if (prevRole !== 'user') {
          filteredMessages.push(msg);
        }
      } else {
        filteredMessages.push(msg);
      }
      prevRole = msg.role;
    }

    truncatedMessages = filteredMessages;
  }

  return truncatedMessages.map(msg => {
    if (msg.role === 'user') {
      return new HumanMessage(msg.content);
    } else if (msg.role === 'assistant') {
      if (msg.tool_calls) {
        return new AIMessage({
          content: msg.content,
          additional_kwargs: { tool_calls: msg.tool_calls }
        });
      } else {
        return new AIMessage(msg.content);
      }
    } else if (msg.role === 'tool') {
      return new ToolMessage({
        content: msg.content,
        tool_call_id: msg.tool_call_id,
        name: msg.name
      });
    } else if (msg.role === 'system') {
      return new SystemMessage(msg.content);
    }
  });
}

function convertAIMessageToOpenAIFormat(aiMessage) {
  return {
    role: 'assistant',
    content: aiMessage.content,
    tool_calls: aiMessage.additional_kwargs.tool_calls
  };
}

function convertToolMessageToOpenAIFormat(toolMessage) {
  return {
    role: 'tool',
    name: toolMessage.name,
    tool_call_id: toolMessage.tool_call_id,
    content: toolMessage.content
  };
}

async function generateCompletion(completionId, messages, options) {
  let { includeToolMessages, ...completionOptions } = setOptionsFromEnv(options);

  includeToolMessages = !!includeToolMessages;

  const llm = new ChatOpenAI({
    apiKey,
    model,
    __includeRawResponse: true,
    ...completionOptions,
    configuration: {
      defaultHeaders: {
        'Connection': 'keep-alive',
        'Keep-Alive': 'timeout=900'
      },
    },
  }).bindTools(completionTools);


  const completionChain = completionPrompt.pipe(llm);

  const currentTime = Math.floor(Date.now() / 1000);

  let conversation = await getConversationFromMessagesRequest(messages);
  let finalContent = '';
  const toolResultsMessages = [];
  let finalUsage = null;

  const processRequest = async (inputData) => {
    try {
      const result = await completionChain.invoke(inputData);
      finalUsage = result.usage_metadata;
      return result;
    } catch (e) {
      const errorMessage = e.message.toLowerCase();
      if (errorMessage.includes("context length") || errorMessage.includes("too many tokens")) {
        const errorResponse = "Error: The tool returned too much data. Please try to be more specific or choose a different approach that requires less data.";
        
        // Find the longest tool message
        const toolMessages = inputData.conversation.filter(msg => msg instanceof ToolMessage);
        if (toolMessages.length > 0) {
          const longestToolMessage = toolMessages.reduce((a, b) => a.content.length > b.content.length ? a : b);
          longestToolMessage.content = errorResponse;
        }

        // Retry with updated conversation
        const retryInput = {
          conversation: [
            ...inputData.conversation,
            new HumanMessage("The previous tool call returned too much data. Please adjust your approach and try again.")
          ]
        };
        const result = await completionChain.invoke(retryInput);
        finalUsage = result.usage_metadata;
        return result;
      } else {
        throw e;
      }
    }
  };

  while (!finalContent) {
    try {
      const result = await processRequest({ conversation });

      if (result.additional_kwargs && result.additional_kwargs.tool_calls && result.additional_kwargs.tool_calls.length > 0) {
        const toolMessages = await processToolCalls(result.additional_kwargs.tool_calls);
        conversation = conversation.concat(toolMessages);
        toolResultsMessages.push(...toolMessages);
      } else {
        finalContent = result.content;
      }
    } catch (error) {
      console.error(`Error during completion: ${error}`);
      throw error;
    }
  }

  const response = {
    id: completionId,
    object: 'chat.completion',
    created: currentTime,
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: finalContent,
        },
        finish_reason: 'stop',
      },
    ]
  };

  if (finalUsage) {
    response.usage = finalUsage;
    response.cost = calculateCost(model, finalUsage.input_tokens, finalUsage.output_tokens);
  }

  if (includeToolMessages) {
    const tool_messages = [];
    for (const message of toolResultsMessages) {
      let openAIMessage;
      if (message instanceof AIMessage) {
        openAIMessage = convertAIMessageToOpenAIFormat(message);
      } else if (message instanceof ToolMessage) {
        openAIMessage = convertToolMessageToOpenAIFormat(message);
      }

      if (openAIMessage) {
        const messageChunk = {
          id: completionId,
          object: 'chat.completion.chunk',
          created: currentTime,
          model,
          choices: [{ index: 0, delta: openAIMessage, finish_reason: null }],
        };
        tool_messages.push(messageChunk);
      }
    }
    response.tool_messages = tool_messages;
  }

  return response;
}

function setOptionsFromEnv(options) {
  if (process.env.OPENAI_FREQUENCY_PENALTY && options.frequencyPenalty == null) 
    options.frequencyPenalty = parseFloat(process.env.OPENAI_FREQUENCY_PENALTY);
  if (process.env.OPENAI_TOP_P && options.topP == null) 
    options.topP = parseFloat(process.env.OPENAI_TOP_P);

  return options;
}

async function* streamCompletion(completionId, messages, options, streamWriter) {
  let { includeToolMessages, ...completionOptions } = setOptionsFromEnv(options);

  includeToolMessages = !!includeToolMessages;
  completionOptions.streamUsage = true;

  
  const llm = new ChatOpenAI({
    apiKey,
    model,
    ...completionOptions,
    __includeRawResponse: true,
    configuration: {
    defaultHeaders: {
        'Connection': 'keep-alive',
        'Keep-Alive': 'timeout=900'
      },
    },
  }).bindTools(completionTools);
  const completionChain = completionPrompt.pipe(llm);

  const currentTime = Math.floor(Date.now() / 1000);
  let conversation = await getConversationFromMessagesRequest(messages);

  const processRequest = async function* (inputData) {
    try {
      const events = completionChain.streamEvents(inputData, { version: 'v2' });
      for await (const event of events) {
        yield event;
      }
    } catch (e) {
      const errorMessage = e.message.toLowerCase();
      if (errorMessage.includes("context length") || errorMessage.includes("too many tokens")) {
        const errorResponse = "Error: The tool returned too much data. Please try to be more specific or choose a different approach that requires less data.";
        
        // Find the longest tool message
        const toolMessages = inputData.conversation.filter(msg => msg instanceof ToolMessage);
        if (toolMessages.length > 0) {
          const longestToolMessage = toolMessages.reduce((a, b) => a.content.length > b.content.length ? a : b);
          longestToolMessage.content = errorResponse;
        }

        // Retry with updated conversation
        const retryInput = {
          conversation: [
            ...inputData.conversation,
            new HumanMessage("The previous tool call returned too much data. Please adjust your approach and try again.")
          ]
        };
        const retryEvents = completionChain.streamEvents(retryInput, { version: 'v2' });
        for await (const event of retryEvents) {
          yield event;
        }
      } else {
        throw e;
      }
    }
  };

  try {
    let insertNewline = false; // Flag to determine if a newline should be inserted
    let lastCitations = null;

    while (true) {
      let hasToolCalls = false;
      for await (const event of processRequest({ conversation })) {
        log('completions', 'stream-event', { event });
        if (insertNewline) {
          // Insert a newline before processing new tokens
          const newlineChunk = {
            id: completionId,
            object: 'chat.completion.chunk',
            created: currentTime,
            model,
            choices: [{ index: 0, delta: { role: 'assistant', content: '\n' }, finish_reason: null }],
          };
          yield newlineChunk;
          insertNewline = false; // Reset the flag after inserting newline
        }

        if (event.event === 'on_chat_model_stream') {
          const citations = event.data.chunk.additional_kwargs?.__raw_response?.citations || [];
          if (citations)
            lastCitations = citations;
          const content = event.data.chunk.content;
          if (content) {
            const tokenChunk = {
              id: completionId,
              object: 'chat.completion.chunk',
              created: currentTime,
              model,
              choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }],
            };
            yield tokenChunk;
          }
        } else if (event.event === 'on_chain_end') {
          if (lastCitations && lastCitations.length > 0) {
            const citations = lastCitations.map((src, idx) => `[${idx + 1}] ${src}`).join('  \n');
    
            const citationChunk = {
              id: completionId,
              object: 'chat.completion.chunk',
              created: currentTime,
              model,
              choices: [{ index: 0, delta: { role: 'assistant', content: `\n\n**Sources:**  \n${citations}`}, finish_reason: null }],
            };

            yield citationChunk;
          }

          if (event.data.output.additional_kwargs.tool_calls) {
            const toolCalls = event.data.output.additional_kwargs.tool_calls;
            const toolMessages = await processToolCalls(toolCalls, streamWriter);
            conversation = conversation.concat(toolMessages);
            hasToolCalls = true;
            insertNewline = true; // Set flag to insert newline before next tokens

            // Include tool messages only if includeToolMessages is true
            if (includeToolMessages) {
              for (const message of toolMessages) {
                let openAIMessage;
                if (message instanceof AIMessage) {
                  openAIMessage = convertAIMessageToOpenAIFormat(message);
                } else if (message instanceof ToolMessage) {
                  openAIMessage = convertToolMessageToOpenAIFormat(message);
                }

                if (openAIMessage) {
                  const messageChunk = {
                    id: completionId,
                    object: 'chat.completion.chunk',
                    created: currentTime,
                    model,
                    choices: [{ index: 0, delta: openAIMessage, finish_reason: null }],
                  };
                  yield messageChunk;
                }
              }
            }
          } else {
            const usage = event.data.output.usage_metadata;
            const cost = calculateCost(model, usage.input_tokens, usage.output_tokens);
            const tokenChunk = {
              id: completionId,
              object: 'chat.completion.chunk',
              created: currentTime,
              model,
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
              usage: usage,
              cost: cost
            };
            yield tokenChunk;
            return;
          }
        }
      }
      if (!hasToolCalls) break;
    }
  } catch (error) {
    console.error(`Error during streaming: ${error}`);
    logErr('completions', 'completions', { id: completionId }, error);
    const errorChunk = {
      id: completionId,
      object: 'chat.completion.chunk',
      created: currentTime,
      model,
      choices: [{ delta: {}, index: 0, finish_reason: 'error' }],
      error: {
        message: error.message,
        type: error.name,
        param: null,
        code: null,
      },
    };
    yield errorChunk;
  }
}

module.exports = {
  generateCompletion,
  streamCompletion
};