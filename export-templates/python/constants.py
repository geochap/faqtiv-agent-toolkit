from pydantic import BaseModel, Field, create_model
from typing import List, Dict, Union, Any, Optional
import os

MANUALS_PATH = os.path.join(os.path.dirname(__file__), 'manuals')
FUNCTIONS_MANUALS_PATH = os.path.join(MANUALS_PATH, 'functions')
TASKS_MANUALS_PATH = os.path.join(MANUALS_PATH, 'tasks')

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

FUNCTION_NAME_TO_TASK_NAME_MAP = {{ functionNameToTaskNameMap }}

ADHOC_PROMPT_TEXT = """{{ generateAnsweringFunctionPrompt }}"""

LIBS = { {{ libsNames }} }

FUNCTIONS = { {{ functionNames }} }