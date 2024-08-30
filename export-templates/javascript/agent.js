const { DynamicStructuredTool } = require('@langchain/core/tools');
const { ChatPromptTemplate } = require('@langchain/core/prompts');
const { ChatOpenAI } = require('@langchain/openai');
const { AIMessage, HumanMessage, SystemMessage } = require('@langchain/core/messages');
const z = require('zod');
const express = require('express');
const bodyParser = require('body-parser');

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

async function captureAndProcessOutput(func, ...args) {
  let output = '';

  // Create a unique console.log for this execution
  const isolatedConsoleLog = (...logArgs) => {
    output += logArgs.join(' ') + '\n';
  };

  try {
    // Call the function with the isolated console.log
    await new Promise((resolve, reject) => {
      const originalConsoleLog = console.log;
      console.log = isolatedConsoleLog;
      
      Promise.resolve(func(...args))
        .then(resolve)
        .catch(reject)
        .finally(() => {
          console.log = originalConsoleLog;
        });
    });

    // Process the output
    let processedResult;
    try {
      processedResult = JSON.parse(output.trim());
    } catch (error) {
      processedResult = output.trim();
    }

    return processedResult;
  } catch (error) {
    throw error;
  }
}

// Capture stdout of tasks
async function toolWrapper(func, ...args) {
  return await captureAndProcessOutput(func, ...args);
}

function createToolsFromSchemas(schemas) {
  const tools = [];
  for (const [name, schema] of Object.entries(schemas)) {
    let description = schema.description;
    if (schema.returns_description) {
      description += ` Returns: ${schema.returns_description}`;
    }

    const tool = new DynamicStructuredTool({
      name,
      description,
      schema: schema.args_schema,
      func: name === 'run_adhoc_task' ? schema.function : (...args) => toolWrapper(schema.function, ...args),
      returnDirect: false,
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

const completionPromptText = `{{ getAssistantInstructionsPrompt }}`;

const completionPrompt = ChatPromptTemplate.fromMessages(
  [
    ("system", completionPromptText),
    ("placeholder", "{chat_history}"),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
  ]
);

// Read the API key and model from environment variables
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;

// Initialize OpenAI LLM for completion agent
const completionLLM = new ChatOpenAI({
  apiKey,
  model,
});

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
  }).then(result => {
    // Process the output
    try {
      return JSON.parse(result);
    } catch (error) {
      return result;
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

      const exampleMessages = relevantExamples.flatMap((example, index) => [
          new HumanMessage(example.task),
          new AIMessage(example.code)
      ]);

      // Use the generic language model for the completion
      const messages = [
        new SystemMessage(adhocPromptText),
        ...exampleMessages,
        new HumanMessage(`${errorContext}${userInput}`)
      ];

      const response = await adhocLLM.generate([messages]);

      const functionCode = extractFunctionCode(response.generations[0][0].text);

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

// Start the server
const port = process.env.PORT || 8000;
app.listen(port, () => {});

