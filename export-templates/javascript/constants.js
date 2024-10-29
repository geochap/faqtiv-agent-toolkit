const z = require('zod');

// Agent lib and functions dependencies
{{ imports }}

// Agent libs
{{ libs }}

// Agent functions
{{ functions }}

// Agent tasks
{{ tasks }}

const TASK_FUNCTIONS = { {{ taskFunctionNames }} };

const TASK_TOOL_SCHEMAS = [{{ taskToolSchemas }}];

const COMPLETION_PROMPT_TEXT = `{{ getAssistantInstructionsPrompt }}`;

const TASK_NAME_TO_FUNCTION_NAME_MAP = {{ taskNameToFunctionNameMap }};

const ADHOC_PROMPT_TEXT = `{{ generateAnsweringFunctionPrompt }}`;

const LIBS = { {{ libsNames }} };

const FUNCTIONS = { {{ functionNames }} };

module.exports = {
  TASK_FUNCTIONS,
  TASK_TOOL_SCHEMAS,
  COMPLETION_PROMPT_TEXT,
  TASK_NAME_TO_FUNCTION_NAME_MAP,
  ADHOC_PROMPT_TEXT,
  LIBS,
  FUNCTIONS
};