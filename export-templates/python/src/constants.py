from pydantic import BaseModel, Field, create_model
from typing import List, Dict, Union, Any, Optional
import os

# Agent lib and functions dependencies
{{ imports }}

# Agent libs
{{ libs }}

# Agent functions
{{ functions }}

class TASKS:
{{ tasks }}

TASK_TOOL_SCHEMAS = {
  {{ taskToolSchemas }}
}

COMPLETION_PROMPT_TEXT = """{{ getAssistantInstructionsPrompt }}"""

TASK_NAME_TO_FUNCTION_NAME_MAP = {{ taskNameToFunctionNameMap }}

TASK_TOOL_CALL_DESCRIPTION_TEMPLATES = {{ taskToolCallDescriptionTemplates }}

ADHOC_PROMPT_TEXT = """{{ generateAnsweringFunctionPrompt }}"""

LIBS = { {{ libsNames }} }

FUNCTIONS = { {{ functionNames }} }

IS_LAMBDA = bool(os.getenv('AWS_LAMBDA_FUNCTION_NAME'))

AGENT_GATEWAY_URL = os.getenv('AGENT_GATEWAY_URL')

AGENT_GATEWAY_TOKEN = os.getenv('AGENT_GATEWAY_TOKEN')

ENV_VARS = {
  "DATA_FILES": "./src/data" if not IS_LAMBDA else "./data"
}
