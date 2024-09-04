const { DynamicStructuredTool } = require('@langchain/core/tools');
const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');
const { ChatOpenAI } = require('@langchain/openai');
const { AIMessage, HumanMessage, SystemMessage, ToolMessage } = require('@langchain/core/messages');
const z = require('zod');
const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

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
const taskToolSchemas = [{{ taskToolSchemas }}]

async function captureAndProcessOutput(func, args) {
  return new Promise((resolve, reject) => {
    const customLog = (...args) => {
      resolve(args.join(' ').trim());
    };

    // Create a context object with all the necessary functions and variables
    const context = {
      require,
      console: { log: customLog },
      // Add all the functions and variables from the local scope that the function might need
      {{ functionNames }}
    };

    // Convert the function to a string
    const funcString = func.toString();

    // Create a new function with the context as its scope
    const contextFunction = new Function(...Object.keys(context), `return (${funcString})`)(...Object.values(context));

    try {
      // Execute the function with the provided arguments
      contextFunction(...args);

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

let adhocPromptText = `
{{ generateAnsweringFunctionPrompt }}
- Wrap the single doTask function in a javascript code block
`;

// Escape curly braces to avoid template errors
adhocPromptText = adhocPromptText.replace(/\{/g, '{{').replace(/\}/g, '}}');

// Read the API key and model from environment variables
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;

// Initialize the adhoc language model
const adhocLLM = new ChatOpenAI({
  apiKey,
  model,
});

function extractFunctionCode(response) {
  const start = response.indexOf("```javascript");
  const end = response.indexOf("```", start + 1);
  if (start !== -1 && end !== -1) {
      return response.slice(start + 13, end).trim();
  }
  return null;
}

async function executeGeneratedFunction(functionCode) {
  return new Promise((resolve, reject) => {
    const customLog = (...args) => {
      resolve(args.join(' ').trim());
    };

    // Create a context object with all the necessary functions and variables
    const context = {
      require,
      console: { log: customLog },
      // Add all the functions and variables from the local scope that the generated function might need
      {{ functionNames }}
    };

    // Create the doTask function with access to the context
    const executeInContext = new Function(...Object.keys(context), functionCode);

    try {
      // Execute the function in the given context
      executeInContext(...Object.values(context));

      // Set a timeout in case customLog is never called
      setTimeout(() => {
        reject(new Error("Function execution timed out"));
      }, 30000); // 30 seconds timeout
    } catch (error) {
      reject(error);
    }
  });
}

async function generateAndExecuteAdhoc(userInput, maxRetries = 3) {
  let retryCount = 0;
  const errors = [];
  let previousCode = null;

  // Get relevant examples
  const relevantExamples = [] //await getRelevantExamples(userInput);

  while (retryCount <= maxRetries) {
    try {
      // Prepare the prompt with error information if available
      let errorContext = "";
      if (errors.length > 0) {
          errorContext = `Previous attempt failed with error: ${errors[errors.length - 1]}\n`;
          if (previousCode) {
            errorContext += `Previous code:\n${previousCode}\n`;
          }
          errorContext += "Please fix the issue and try again.\n";
      }

      const exampleMessages = relevantExamples.flatMap((example) => [
          new HumanMessage(example.task),
          new AIMessage(example.code)
      ]);

      // Use the generic language model for the completion
      const messages = [
        new SystemMessage(adhocPromptText),
        ...exampleMessages,
        new HumanMessage(`${errorContext}${userInput}`)
      ];

      const response = await adhocLLM.invoke(messages);

      const functionCode = extractFunctionCode(response.content);

      if (!functionCode) {
        throw new Error("Failed to generate function code");
      }

      previousCode = functionCode;

      return await executeGeneratedFunction(functionCode);
    } catch (e) {
      const errorMessage = e.message;
      console.error(`Error during execution (attempt ${retryCount + 1}): ${errorMessage}`);
      errors.push(errorMessage);
      retryCount++;

      if (retryCount > maxRetries) {
        console.error(`Max retries (${maxRetries}) reached. Aborting.`);
        throw new Error(`Max retries reached. Last error: ${errorMessage}`);
      }

      console.log(`Retrying... (attempt ${retryCount} of ${maxRetries})`);
    }
  }

  // This line should never be reached, but just in case
  throw new Error("Unexpected error occurred");
}

// http agent

const app = express();
app.use(bodyParser.json());

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
    const result = await generateAndExecuteAdhoc(input);
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

// Initialize OpenAI LLM for completion agent
const completionLLM = new ChatOpenAI({
  apiKey,
  model,
})
.bindTools(completionTools);

const completionPromptText = `{{ getAssistantInstructionsPrompt }}`;

const completionPrompt = ChatPromptTemplate.fromMessages(
  [
    ("system", completionPromptText),
    new MessagesPlaceholder("conversation")
  ]
);

const completionChain = completionPrompt.pipe(completionLLM);

app.post('/completions', async (req, res) => {
  const { stream = false } = req.body;

  if (stream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    await streamCompletion(req, res);
  } else {
    try {
      const result = await generateCompletion(req.body);
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
    if (tool) {
      const toolResult = await tool.func(JSON.parse(toolCall.function.arguments));
      toolMessages.push(new ToolMessage({
        content: toolResult,
        tool_call_id: toolCall.id,
      }));
    }
  }
  return toolMessages;
}

async function generateCompletion(request) {
  const currentTime = Math.floor(Date.now() / 1000);
  const completionId = `cmpl-${uuidv4()}`;

  let conversation = request.messages.map(msg => ({ role: msg.role, content: msg.content }));
  let finalContent = '';

  do {
    const result = await completionChain.invoke({
      input: conversation[conversation.length - 1].content,
      chat_history: conversation.length > 1 ? conversation.slice(0, -1) : [],
    });

    if (result.additional_kwargs && result.additional_kwargs.tool_calls && result.additional_kwargs.tool_calls.length > 0) {
      const toolMessages = await processToolCalls(result.additional_kwargs.tool_calls);
      conversation = conversation.concat(toolMessages);
    } else {
      finalContent = result.content;
    }
  } while (!finalContent);

  return {
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
    ],
  };
}

async function streamCompletion(req, res) {
  const { messages } = req.body;
  const currentTime = Math.floor(Date.now() / 1000);
  const completionId = `cmpl-${uuidv4()}`;
  let conversation = messages.map(msg => ({ role: msg.role, content: msg.content }));

  try {
    do {
      const events = completionChain.streamEvents({
        conversation,
      }, {
        version: 'v2'
      });

      for await (const event of events) {
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
            res.write(`data: ${JSON.stringify(tokenChunk)}\n\n`);
          }
        } else if (event.event === 'on_chain_end') {
          if (event.data.output.additional_kwargs.tool_calls) {
            const toolCalls = event.data.output.additional_kwargs.tool_calls;
            const toolMessages = await processToolCalls(toolCalls);
            conversation = conversation.concat(toolMessages);
          } else {
            const tokenChunk = {
              id: completionId,
              object: 'chat.completion.chunk',
              created: currentTime,
              model,
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            };
            res.write(`data: ${JSON.stringify(tokenChunk)}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }
        }
      }
    } while (true);
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
    res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

// Start the server
const port = process.env.PORT || 8000;
app.listen(port, () => {});

