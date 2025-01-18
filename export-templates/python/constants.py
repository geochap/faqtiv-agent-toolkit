from pydantic import BaseModel, Field, create_model
from typing import List, Dict, Union, Any, Optional

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

ADHOC_PROMPT_TEXT = """{{ generateAnsweringFunctionPrompt }}"""

LIBS = { {{ libsNames }} }

FUNCTIONS = { {{ functionNames }} }