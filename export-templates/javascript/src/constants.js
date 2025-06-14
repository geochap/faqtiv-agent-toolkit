const log4js = require('log4js');
const z = require('zod');
const { logDir } = require('./components/logger');

// Agent lib and functions dependencies
{{ imports }}

// Agent libs
{{ libs }}

// Agent functions
{{ functions }}

// Agent tasks
const TASKS = {
  {{ tasks }}
};

const TASK_TOOL_SCHEMAS = [{{ taskToolSchemas }}];

const COMPLETION_PROMPT_TEXT = `{{ getAssistantInstructionsPrompt }}`;

const TASK_NAME_TO_FUNCTION_NAME_MAP = {{ taskNameToFunctionNameMap }};

const TASK_TOOL_CALL_DESCRIPTION_TEMPLATES = {{ taskToolCallDescriptionTemplates }};

const ADHOC_PROMPT_TEXT = `{{ generateAnsweringFunctionPrompt }}`;

const LIBS = { {{ libsNames }} };

const FUNCTIONS = { {{ functionNames }} };

const IS_LAMBDA = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const AGENT_GATEWAY_URL = process.env.AGENT_GATEWAY_URL;

const AGENT_GATEWAY_TOKEN = process.env.AGENT_GATEWAY_TOKEN;

const ENV_VARS = {
  DATA_FILES: IS_LAMBDA ? "./data" : "./src/data"
};

module.exports = {
  TASKS,
  TASK_TOOL_SCHEMAS,
  COMPLETION_PROMPT_TEXT,
  TASK_NAME_TO_FUNCTION_NAME_MAP,
  TASK_TOOL_CALL_DESCRIPTION_TEMPLATES,
  ADHOC_PROMPT_TEXT,
  LIBS,
  FUNCTIONS,
  ENV_VARS,
  IS_LAMBDA,
  AGENT_GATEWAY_URL,
  AGENT_GATEWAY_TOKEN
};
