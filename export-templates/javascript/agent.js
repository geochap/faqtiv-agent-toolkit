const { DynamicStructuredTool } = require('@langchain/core/tools');
const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');
const { ChatOpenAI, OpenAIEmbeddings } = require('@langchain/openai');
const { AIMessage, HumanMessage, SystemMessage, ToolMessage } = require('@langchain/core/messages');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const http = require('http');
const z = require('zod');
const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const readline = require('readline');
const figlet = require('figlet');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

// Agent lib and functions dependencies
{{ imports }}

// Agent libs
{{ libs }}

// Agent functions
{{ functions }}

// Task name mapping
const taskNameMap = {{ taskNameMap }}

// Agent tasks
{{ tasks }}

const taskFunctions = { {{ taskFunctionNames }} };

// Task tool schemas
const taskToolSchemas = [{{ taskToolSchemas }}];

// Examples with pre-computed embeddings
const examplesWithEmbeddings = {{ examples }}

// Initialize embeddings
const embeddings = new OpenAIEmbeddings({
  model: 'text-embedding-ada-002'
});

function decodeBase64Embedding(b64String) {
  const buffer = Buffer.from(b64String, 'base64');
  const decodedArray = new Float32Array(buffer);
  return decodedArray;
}

// Create vector store from pre-computed embeddings
const documents = examplesWithEmbeddings.map(example => 
  ({ pageContent: JSON.stringify({ ...example.document, embedding: null }), metadata: {} })
);
const embeddingsList = examplesWithEmbeddings.map(example => 
  decodeBase64Embedding(example.taskEmbedding)
);
const vectorStore = new MemoryVectorStore();
vectorStore.addVectors(embeddingsList, documents);

async function getEmbedding(text) {
  text = text.replace("\n", " ")
  return await embeddings.embedQuery(text)
}

async function getRelevantExamples(query, k = 10) {
  const queryEmbedding = await getEmbedding(query);
  const results = await vectorStore.similaritySearchVectorWithScore(queryEmbedding, k);

  const relevantExamples = [];
  for (const doc of results) {
    const example = JSON.parse(doc[0].pageContent);
    relevantExamples.push({
      task: example.task,
      code: example.code
    });
  }
  return relevantExamples;
}

async function captureAndProcessOutput(func, args = []) {
  return new Promise((resolve, reject) => {
    const customLog = (...args) => {
      resolve(args.join(' ').trim());
    };

    // Create a context object with all the necessary functions and variables
    const context = {
      require,
      console: { log: customLog, warn: console.warn, error: console.error },
      // Add all the functions and variables from the local scope that the function might need
      {{ libsNames }}
      {{ functionNames }}
    };

    // Convert the function to a string
    const funcString = typeof func === 'function' ? func.toString() : func;

    // Create a new function with the context as its scope
    const contextFunction = new Function(...Object.keys(context), `
      return async function() {
        try {
          return await (${funcString}).apply(this, arguments);
        } catch (error) {
          console.warn("Error executing tool:", error);
          throw error;
        }
      }
    `)(...Object.values(context));

    try {
      // Execute the function with the provided arguments
      contextFunction(...args).then(resolve).catch(reject);

      // Set a timeout in case customLog is never called
      setTimeout(() => {
        reject(new Error("Function execution timed out"));
      }, 30000); // 30 seconds timeout
    } catch (error) {
      reject(error);
    }
  });
}

// Capture stdout of tasks
async function toolWrapper(func, args) {
  // todo: make sure the args are in the correct positional order
  // this code extracts the args map from the object and passes them as individual value arguments
  try {
    const result = await captureAndProcessOutput(func, Object.values(args));
    // Ensure the result is a string
    return (typeof result === 'object' ? JSON.stringify(result) : String(result));
  } catch (error) {
    console.error(`Error in toolWrapper: ${error.message}`);
    return `Error: ${error.message}`;
  }
}

function createToolsFromSchemas(schemas) {
  const tools = [];
  for (const schema of schemas) {
    let description = schema.description;
    if (schema.returns_description) {
      description += ` Returns: ${schema.returns_description}`;
    }

    const tool = new DynamicStructuredTool({
      name: schema.name,
      description,
      schema: schema.schema,
      func: schema.name === 'run_adhoc_task' ? schema.func : async (...args) => await toolWrapper(schema.func, ...args)
    });

    tools.push(tool);
  }
  return tools;
}

// Create tools from schemas
const taskTools = createToolsFromSchemas(taskToolSchemas);

let adhocPromptText = `{{ generateAnsweringFunctionPrompt }}`;

// Read the API key and model from environment variables
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;

if (!apiKey) {
  throw new Error("OPENAI_API_KEY environment variable is not set");
}

if (!model) {
  throw new Error("OPENAI_MODEL environment variable is not set");
}

// Initialize the adhoc language model
const adhocLLM = new ChatOpenAI({
  apiKey,
  model,
});

function cleanCodeBlock(block) {
  return block
    .replace(/```[\w]*\n?/, '') // Remove the opening code block tag and optional language identifier
    .replace(/```\s*$/, '') // Remove the closing code block tag
    .trim();
}

function extractFunctionCode(inputText, targetFunctionName = 'doTask') {
  const cleanedText = cleanCodeBlock(inputText);
  const ast = parse(cleanedText, {
    sourceType: "module",
    plugins: ["asyncGenerators"]
  });
  let functionCode = '';

  traverse(ast, {
    FunctionDeclaration(path) {
      if (path.node.id.name === targetFunctionName) {
        functionCode = cleanedText.substring(path.node.start, path.node.end);
      }
    },
    ArrowFunctionExpression(path) {
      if (path.node.id && path.node.id.name === targetFunctionName) {
        functionCode = cleanedText.substring(path.node.start, path.node.end);
      }
    },
    FunctionExpression(path) {
      if (path.node.id && path.node.id.name === targetFunctionName) {
        functionCode = cleanedText.substring(path.node.start, path.node.end);
      }
    },
  });
  return functionCode;
}

async function generateAndExecuteAdhoc(userInput, maxRetries = 5) {
  let retryCount = 0;
  const errors = [];
  let previousCode = null;

  // Get relevant examples
  const relevantExamples = await getRelevantExamples(userInput);

  while (retryCount < maxRetries) {
    try {
      // Prepare the prompt with error information if available
      let errorContext = "";
      if (errors.length > 0) {
        errorContext = `Previous attempts failed with the following errors:\n`;
        errors.forEach((error, index) => {
          const modifiedError = error.includes("The request cannot be fulfilled using the available functions")
            ? "Syntax error" // faking a syntax error seems to improve the retry success rate
            : error;
          errorContext += `${index + 1}. ${'-'.repeat(40)}\n${modifiedError}\n\n`;
        });
        
        if (previousCode) {
          errorContext += `Previous code:\n\`\`\`javascript\n${previousCode}\n\`\`\`\n\n`;
        }
        errorContext += `Please address these issues in your response and improve upon the previous code if provided.`;
      }

      const exampleMessages = relevantExamples.flatMap((example) => [
          new HumanMessage(example.task),
          new AIMessage(example.code)
      ]);

      // Use the generic language model for the completion
      const messages = [
        new SystemMessage("You are a useful technical assistant."),
        new AIMessage(adhocPromptText),
        ...exampleMessages,
        new HumanMessage(`${userInput}\n\n${errorContext}`)
      ];

      const response = await adhocLLM.invoke(messages);

      if (response.content.includes('The request cannot be fulfilled using the available functions')) {
        throw new Error(response.content);
      }

      const functionCode = extractFunctionCode(response.content);

      if (!functionCode) {
        throw new Error("Failed to generate function code");
      }

      previousCode = functionCode;

      console.log("Generated code:", functionCode);

      return await captureAndProcessOutput(functionCode);
    } catch (e) {
      const errorMessage = e.message;
      console.error(`Error during execution (attempt ${retryCount + 1}): ${errorMessage}`);
      errors.push(errorMessage);
      retryCount++;

      if (retryCount === maxRetries) {
        console.error(`Max retries (${maxRetries}) reached. Aborting.`);
        throw new Error(`Max retries reached. Last error: ${errorMessage}`);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      console.log(`Retrying... (attempt ${retryCount} of ${maxRetries})`);
    }
  }

  // This line should never be reached, but just in case
  throw new Error("Unexpected error occurred");
}

// http agent

const app = express();
app.use(bodyParser.json({limit: '10mb'}));

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  next();
});

// Run adhoc task endpoint
app.post('/run_adhoc', async (req, res) => {
  try {
    const { input } = req.body;
    let result = await generateAndExecuteAdhoc(input);

    try {
      result = JSON.parse(result);
    } catch (e) {}

    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Run task endpoint
app.post('/run_task/:taskName', async (req, res) => {
  const { taskName } = req.params;
  const args = req.body.args || {};

  const validTaskName = taskNameMap[taskName] || taskName;

  if (typeof taskFunctions[validTaskName] !== 'function') {
    return res.status(404).json({ error: `Task '${taskName}' not found` });
  }

  // todo: make sure the args are in the correct positional order
  try {
    const result = await captureAndProcessOutput(taskFunctions[validTaskName], Object.values(args));
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create an agent for the completion endpoint using the adhoc tool
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

const completionPromptText = `{{ getAssistantInstructionsPrompt }}`;

const completionPrompt = ChatPromptTemplate.fromMessages(
  [
    new SystemMessage(completionPromptText),
    new MessagesPlaceholder("conversation")
  ]
);

app.post('/completions', async (req, res) => {
  const { 
    stream, 
    messages, 
    include_tool_messages,
    max_tokens,
    temperature
  } = req.body;

  console.log("Completion request: ", messages.length > 0 ? messages[messages.length - 1].content : "")

  if (stream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    for await (const chunk of streamCompletion(messages, include_tool_messages, max_tokens, temperature)) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } else {
    try {
      const result = await generateCompletion(messages, include_tool_messages, max_tokens, temperature);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
});

async function processToolCalls(toolCalls) {
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
        const toolResult = await tool.func(JSON.parse(toolCall.function.arguments));
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

function getConversationFromMessagesRequest(messages) {
  return messages.map(msg => {
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

async function generateCompletion(messages, includeToolMessages = false, maxTokens, temperature) {
  const llm = new ChatOpenAI({
    apiKey,
    model,
    maxTokens,
    temperature
  }).bindTools(completionTools);
  const completionChain = completionPrompt.pipe(llm);

  const currentTime = Math.floor(Date.now() / 1000);
  const completionId = `cmpl-${uuidv4()}`;

  let conversation = getConversationFromMessagesRequest(messages);
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

async function* streamCompletion(messages, includeToolMessages = false, maxTokens, temperature) {
  const llm = new ChatOpenAI({
    apiKey,
    model,
    maxTokens,
    temperature
  }).bindTools(completionTools);
  const completionChain = completionPrompt.pipe(llm);

  const currentTime = Math.floor(Date.now() / 1000);
  const completionId = `cmpl-${uuidv4()}`;
  let conversation = getConversationFromMessagesRequest(messages);

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
            const toolMessages = await processToolCalls(toolCalls);
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

async function cliAgent() {
  console.log("Welcome, please type your request. Type 'exit' to quit.");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const conversation = [];

  const askQuestion = () => {
    return new Promise((resolve) => {
      rl.question("\nYou: ", (answer) => {
        resolve(answer);
      });
    });
  };

  while (true) {
    const userInput = await askQuestion();

    if (userInput.toLowerCase() === 'exit') {
      console.log("Goodbye!");
      rl.close();
      break;
    }

    process.stdout.write("\nAgent: ");

    try {
      conversation.push({ role: 'user', content: userInput });

      let fullResponse = '';

      for await (const chunk of streamCompletion(conversation)) {
        if (chunk.choices[0].delta.content) {
          const content = chunk.choices[0].delta.content;
          process.stdout.write(content);
          fullResponse += content;
        }
      }

      console.log(); // Add a newline after the response

      conversation.push({ role: 'assistant', content: fullResponse });
    } catch (error) {
      console.error(`\nError during execution: ${error.message}`);
    }
  }
}

function shutdownServer(server) {
  return new Promise((resolve) => {
    server.close(() => {
      console.log('Server shut down gracefully');
      resolve();
    });
  });
}

if (require.main === module) {
  console.log(figlet.textSync("FAQtiv"));

  const args = process.argv.slice(2);
  if (args.includes('--http')) {
    const port = process.env.PORT || 8000;
    const shutdownKey = process.env.SHUTDOWN_KEY;

    const server = http.createServer(app);

    if (shutdownKey) {
      app.post('/shutdown', (req, res) => {
        const { key } = req.body;

        console.log('Received shutdown request');

        if (key === shutdownKey) {
          res.status(200).send('Shutting down server');
          shutdownServer(server).then(() => {
            process.exit(0);
          });
        } else {
          res.status(403).send('Invalid shutdown key');
        }
      });
    }

    server.listen(port, () => {
      console.log(`HTTP server running on port ${port}`);
    });
  } else {
    cliAgent();
  }
}