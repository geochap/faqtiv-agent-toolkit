const z = require('zod');
const path = require('path');

const MANUALS_PATH = path.join(__dirname, './manuals');
const FUNCTIONS_MANUALS_PATH = path.join(MANUALS_PATH, './functions');
const TASKS_MANUALS_PATH = path.join(MANUALS_PATH, './tasks');

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

const FUNCTION_NAME_TO_TASK_NAME_MAP = {{ functionNameToTaskNameMap }};

const ADHOC_PROMPT_TEXT = `{{ generateAnsweringFunctionPrompt }}`;

const LIBS = { {{ libsNames }} };

const FUNCTIONS = { {{ functionNames }} };

module.exports = {
  TASKS,
  TASK_TOOL_SCHEMAS,
  COMPLETION_PROMPT_TEXT,
  TASK_NAME_TO_FUNCTION_NAME_MAP,
  FUNCTION_NAME_TO_TASK_NAME_MAP,
  ADHOC_PROMPT_TEXT,
  LIBS,
  FUNCTIONS,
  FUNCTIONS_MANUALS_PATH,
  TASKS_MANUALS_PATH,
};