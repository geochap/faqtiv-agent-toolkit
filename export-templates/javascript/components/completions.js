const { DynamicStructuredTool, tool } = require('@langchain/core/tools');
const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');
const { ChatOpenAI } = require('@langchain/openai');
const { AIMessage, HumanMessage, SystemMessage, ToolMessage } = require('@langchain/core/messages');
const z = require('zod');
const { createToolsFromSchemas, generateAndExecuteAdhoc } = require('./tools');
const { getMessagesWithinContextLimit } = require('./context-manager');
const { TASK_TOOL_SCHEMAS, COMPLETION_PROMPT_TEXT } = require('../constants');
const { logErr } = require('./logger');

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
    func: async ({ description }) => {
      try {
        const result = await generateAndExecuteAdhoc(description);
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

async function processToolCalls(toolCalls, emitEvent) {
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
        const toolResult = await tool.func(JSON.parse(toolCall.function.arguments), emitEvent);
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
  const truncatedMessages = await getMessagesWithinContextLimit(model, messages);

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

function getToolDescription(toolCall) {
  const tool = TASK_TOOL_SCHEMAS.find(t => t.name === toolCall.function.name);
  if (!tool) return '';

  const args = JSON.parse(toolCall.function.arguments);
  console.warn(args, tool);

  const shape = tool.schema._def.shape();
  const descriptions = [];

  // Iterate over each field in the shape
  for (const key in shape) {
    const field = shape[key];
    const description = field._def.description || 'No description';
    let value = args[key] !== undefined ? String(args[key]) : 'N/A';

    // Truncate value if too long
    if (value.length > 30) {
      value = value.substring(0, 27) + '...';
    }

    descriptions.push(`${key}: ${description} (Value: ${value})`);
  }

  console.warn("Calling tool:", toolCall.function.name, toolCall.function.arguments);

  return `${tool.description}\nParameters:\n${descriptions.join('\n')}`;
}


async function generateCompletion(completionId, messages, includeToolMessages = false, maxTokens, temperature) {
  const llm = new ChatOpenAI({
    apiKey,
    model,
    maxTokens,
    temperature
  }).bindTools(completionTools);
  const completionChain = completionPrompt.pipe(llm);

  const currentTime = Math.floor(Date.now() / 1000);

  let conversation = await getConversationFromMessagesRequest(messages);
  let finalContent = '';
  const toolResultsMessages = [];

  const processRequest = async (inputData) => {
    try {
      const result = await completionChain.invoke(inputData);
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
        return await completionChain.invoke(retryInput);
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

async function* streamCompletion(completionId, messages, includeToolMessages = false, maxTokens, temperature, emitEvent) {
  const llm = new ChatOpenAI({
    apiKey,
    model,
    maxTokens,
    temperature
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
    while (true) {
      let hasToolCalls = false;
      for await (const event of processRequest({ conversation })) {
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
          if (event.data.output.additional_kwargs.tool_calls) {
            const toolCalls = event.data.output.additional_kwargs.tool_calls;

            if (false){
              for (const toolCall of toolCalls) {
                const toolCallChunk = {
                  id: completionId,
                  object: 'chat.completion.chunk',
                  created: currentTime,
                  model,
                  choices: [{ index: 0, delta: { role: 'assistant', content: `\n\`\`\`agent-message\nRunning tool: ${getToolDescription(toolCall)}\n\`\`\`\n` }, finish_reason: null }],
                };
                yield toolCallChunk;
              }
            }

            const toolMessages = await processToolCalls(toolCalls, (data) => {if(emitEvent) emitEvent(data, model)}); 
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
            const tokenChunk = {
              id: completionId,
              object: 'chat.completion.chunk',
              created: currentTime,
              model,
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
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