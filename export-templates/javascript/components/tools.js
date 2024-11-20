const { DynamicStructuredTool } = require('@langchain/core/tools');
const { AIMessage, HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { ChatOpenAI } = require('@langchain/openai');
const z = require('zod');
const path = require('path');
const fs = require('fs');
const { getRelevantExamples } = require('./examples');
const { createAdhocLogFile } = require('./logger');
const { extractFunctionCode } = require('./parser');
const { ADHOC_PROMPT_TEXT, LIBS, FUNCTIONS, FUNCTIONS_MANUALS_PATH, TASKS_MANUALS_PATH, FUNCTION_NAME_TO_TASK_NAME_MAP } = require('../constants');

const TOOL_TIMEOUT = parseInt(process.env.TOOL_TIMEOUT || '60000');

function captureAndProcessOutput(func, args = []) {
  return new Promise((resolve, reject) => {
    const customLog = (arg) => {
      // Assuming we only need the first argument as tasks return a single object
      let result = arg;

      if (typeof result === 'string') {
        try {
          result = JSON.parse(result);
        } catch (error) {
          // If parsing fails, keep it as a string
          // No need to do anything here as result is already a string
        }
      } else {
        // Convert non-string types to string
        result = String(result);
      }
      
      resolve(result);
    };

    // Create a context object with all the necessary functions and variables
    const context = {
      require,
      console: { log: customLog, warn: console.warn, error: console.error },
      // Add all the functions and variables from the local scope that the function might need
      ...LIBS,
      ...FUNCTIONS
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

      setTimeout(() => {
        reject(new Error(`Function execution timed out after ${TOOL_TIMEOUT} ms`));
      }, TOOL_TIMEOUT);
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
    const isAgentTool = [
      'run_adhoc_task',
      'get_tool_manual',
      'get_function_manual'
    ].includes(schema.name);

    const tool = new DynamicStructuredTool({
      name: schema.name,
      description,
      schema: schema.schema,
      func: isAgentTool ? schema.func : async (...args) => await toolWrapper(schema.func, ...args)
    });

    tools.push(tool);
  }
  return tools;
}

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;

const adhocLLM = new ChatOpenAI({
  apiKey,
  model,
});

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
        errorContext = `This is retry attempt ${retryCount}.\nPrevious errors:\n`;
        errors.forEach((error, index) => {
          const modifiedError = error.includes("The request cannot be fulfilled using the available functions")
            ? "Syntax error" // faking a syntax error seems to improve the retry success rate
            : error;
          errorContext += `${index + 1}. ${'-'.repeat(40)}\n${modifiedError}\n\n`;
        });
        
        if (previousCode) {
          errorContext += `Previous code:\n\`\`\`javascript\n${previousCode}\n\`\`\`\n\n`;
        }
        errorContext += `The previously generated code failed because of these issues, please re-write the code to address them.\nIf the errors are not clear or useful please write the code again based on the instructions and available functions.\nAssume you are more capable than the agent that generated the previous attempt and you can make better decisions.`;
      }

      const exampleMessages = relevantExamples.flatMap((example) => [
        new HumanMessage(example.task),
        new AIMessage(example.code)
      ]);

      // Use the generic language model for the completion
      const messages = [
        new SystemMessage("You are a useful technical assistant."),
        new SystemMessage(ADHOC_PROMPT_TEXT),
        ...exampleMessages,
        new HumanMessage(`${userInput}\n\n${errorContext}`)
      ];

      const response = await adhocLLM.invoke(messages);

      if (response.content.includes('The request cannot be fulfilled using the available functions')) {
        throw new Error(response.content);
      }

      const functionCode = extractFunctionCode(response.content);

      if (!functionCode) {
        throw new Error(`Failed to parse function code: ${response.content}`);
      }

      previousCode = functionCode;

      console.log("Generated code:", functionCode);

      const result = await captureAndProcessOutput(functionCode);
      
      createAdhocLogFile(userInput, functionCode, result);
      
      return result;
    } catch (e) {
      const errorMessage = e.message;
      console.error(`Error during execution (attempt ${retryCount + 1}): ${errorMessage}`);
      errors.push(errorMessage);
      retryCount++;

      if (retryCount === maxRetries) {
        console.error(`Max retries (${maxRetries}) reached. Aborting.`);
        createAdhocLogFile(userInput, previousCode, '', new Error(`Max retries reached. Last error: ${errorMessage}`));
        throw new Error(`Max retries reached. Last error: ${errorMessage}`);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      console.log(`Retrying... (attempt ${retryCount} of ${maxRetries})`);
    }
  }

  // This line should never be reached, but just in case
  throw new Error("Unexpected error occurred");
}

const runAdhocTaskTool = new DynamicStructuredTool({
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
});

const getToolManualTool = new DynamicStructuredTool({
  name: 'get_tool_manual',
  description: 'Read a tool manual',
  schema: z.object({
    name: z.string().describe('The name of the tool'),
  }),
  func: async ({ name }) => {
    try {
      if (!name) {
        throw new Error('Name is required');
      }

      // Get the task name from the function name
      const taskName = FUNCTION_NAME_TO_TASK_NAME_MAP[name.replace(".md", "")] || name;

      const fileName = `${taskName}.md`;
      const filePath = path.join(TASKS_MANUALS_PATH, fileName);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Tool manual ${fileName} not found`);
      }
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      console.error(`Error reading tool manual: ${error.message}`);
      throw new Error(`Error reading tool manual: ${error.message}`);
    }
  },
});

const getFunctionManualTool = new DynamicStructuredTool({
  name: 'get_function_manual',
  description: 'Read a function manual',
  schema: z.object({
    name: z.string().describe('The name of the function'),
  }),
  func: async ({ name }) => {
    try {
      if (!name) {
        throw new Error('Name is required');
      }

      const fileName = name.endsWith('.md') ? name : `${name}.md`;
      const filePath = path.join(FUNCTIONS_MANUALS_PATH, fileName);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Function manual ${fileName} not found`);
      }
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      throw new Error(`Error reading function manual: ${error.message}`);
    }
  },
  returnDirect: false,
});

const agentTools = [
  runAdhocTaskTool,
  getToolManualTool,
  getFunctionManualTool,
];

module.exports = {
  captureAndProcessOutput,
  createToolsFromSchemas,
  generateAndExecuteAdhoc,
  agentTools,
};