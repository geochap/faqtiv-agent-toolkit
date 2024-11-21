import os
import asyncio
import io
import json
import sys
import traceback
from typing import Dict, Any, List
from langchain_core.tools import StructuredTool
from langchain_openai import ChatOpenAI
from langchain.schema import SystemMessage, HumanMessage, AIMessage
from langchain.chat_models.base import BaseChatModel
from pydantic import create_model
from functools import partial
from contextlib import redirect_stdout
from components.examples import get_relevant_examples
from components.parser import extract_function_code
from components.logger import create_adhoc_log_file
from constants import ADHOC_PROMPT_TEXT, LIBS, FUNCTIONS, TASKS_MANUALS_PATH, FUNCTIONS_MANUALS_PATH, FUNCTION_NAME_TO_TASK_NAME_MAP
from langchain_core.messages import ToolMessage

TOOL_TIMEOUT = int(os.getenv('TOOL_TIMEOUT', 60000)) / 1000

# todo: do we need to handle warn and error logs?
async def capture_and_process_output(func, *args, **kwargs):
    f = io.StringIO()
    try:
        async def execute():
            with redirect_stdout(f):
                if asyncio.iscoroutinefunction(func):
                    return await func(*args, **kwargs)
                else:
                    return func(*args, **kwargs)

        result = await asyncio.wait_for(execute(), timeout=TOOL_TIMEOUT)

        output = f.getvalue()
        
        try:
            processed_result = json.loads(output)
        except json.JSONDecodeError:
            processed_result = output.strip()
        
        return processed_result
    except asyncio.TimeoutError:
        print(f"Execution timed out after {TOOL_TIMEOUT} seconds", file=sys.stderr)
        raise
    except Exception as e:
        print(f"Error executing tool:", file=sys.stderr)
        traceback.print_exc()
        raise

# Capture stdout of tasks
async def tool_wrapper(func, *args, **kwargs):
    # todo: make sure the args are in the correct positional order
    # this code extracts the args map from the object and passes them as individual value arguments
    arguments = args[0] if isinstance(args, tuple) and len(args) == 1 else args
    arguments_json = json.dumps(arguments)
    arguments_map = json.loads(arguments_json)
    positional_args = list(arguments_map.values())
            
    return await capture_and_process_output(func, *positional_args, **kwargs)

def create_tools_from_schemas(schemas: Dict[str, Dict[str, Any]]) -> List[StructuredTool]:
    tools = []
    for name, schema in schemas.items():
        description = schema["description"]
        if "returns_description" in schema:
            description += f" Returns: {schema['returns_description']}"
        
        is_agent_tool = name in [
            "run_adhoc_task",
            "get_tool_manual",
            "get_function_manual"
        ]
        if is_agent_tool:
            func = schema["function"]
        else:
            func = partial(tool_wrapper, schema["function"])
        
        tool = StructuredTool(
            name=name,
            description=description,
            args_schema=schema["args_schema"],
            coroutine=func,
            metadata={"output": schema["output"]}
        )
        tools.append(tool)
    return tools

api_key = os.getenv('OPENAI_API_KEY')
model = os.getenv('OPENAI_MODEL')

async def get_function_manual(params: Dict[str, Any]) -> str:
    try:
        name = params["name"]
        if not name:
            raise ValueError("Name is required")
        # Add .md extension only if not already present
        file_name = f"{name}.md" if not name.endswith('.md') else name
        file_name = file_name.replace("function.", "")
        file_path = os.path.join(FUNCTIONS_MANUALS_PATH, file_name)
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Task manual {file_name} not found")
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as error:
        raise Exception(f"Error reading task manual: {str(error)}")

adhoc_tools_schemas = {
    "get_function_manual": {
        "description": "A tool for an agent to read a function manual",
        "input": {
            "name": str
        },
        "args_schema": create_model(
            "getFunctionManual",
            name=(str, ...) 
        ),
        "output": str,
        "function": get_function_manual
    },
}
adhoc_tools = create_tools_from_schemas(adhoc_tools_schemas)

adhoc_llm: BaseChatModel = ChatOpenAI(api_key=api_key, model=model).bind_tools(adhoc_tools)

async def execute_generated_function(function_code):
    # Create a temporary module to execute the function
    import types
    module = types.ModuleType("temp_module")
    
    # Add necessary imports to the module
    module.__dict__.update({
        **{func.__name__: func for func in LIBS},
        **{func.__name__: func for func in FUNCTIONS},
        'json': json,
    })
    
    # Execute the function code in the module's context
    exec(function_code, module.__dict__)
    
    # Call the doTask function
    result = module.doTask()
    
    # If the result is a coroutine, await it
    if asyncio.iscoroutine(result):
        result = await result
    
    return result

async def process_adhoc_tool_calls(tool_calls):
    tool_messages = []
    for tool_call in tool_calls:
        print("Calling tool:", tool_call["function"]["name"], tool_call["function"]["arguments"], flush=True)

        tool = next((t for t in adhoc_tools if t.name == tool_call["function"]["name"]), None)
        if tool:
            try:
                tool_result = await tool.coroutine(json.loads(tool_call["function"]["arguments"]))
            except Exception as e:
                error_message = f"Error in tool '{tool_call['function']['name']}': {str(e)}"
                print("Error in tool:", error_message, flush=True)
                tool_result = {"error": error_message}
            
            tool_messages.append(
                ToolMessage(
                    content=json.dumps({
                        "type": "tool_result",
                        "result": tool_result
                    }),
                    tool_call_id=tool_call["id"]
                )
            )
        else:
            print("Tool not found:", tool_call["function"]["name"], flush=True)
            tool_messages.append(
                ToolMessage(
                    content=json.dumps({
                        "type": "tool_result",
                        "result": {"error": "Tool not found"}
                    }),
                    tool_call_id=tool_call["id"]
                )
            )
    
    return tool_messages

async def generate_and_execute_adhoc(user_input: str, max_retries: int = 5):
    retry_count = 0
    errors = []
    previous_code = None
    previous_tool_messages = [] # persist tool messages across retries to avoid refetching manuals

    # Get relevant examples
    relevant_examples = get_relevant_examples(user_input)

    while retry_count < max_retries:
        try:
            # Prepare the prompt with error information if available
            error_context = ""
            if errors:
                error_context = f"This is retry attempt ${retry_count}.\nPrevious errors:\n"
                for index, error in enumerate(errors, 1):
                    # faking a syntax error seems to improve the retry success rate
                    modified_error = "Syntax error" if "The request cannot be fulfilled using the available functions" in error else error
                    error_context += f"{index}. {'-' * 40}\n{modified_error}\n\n"
                
                if previous_code:
                    error_context += f"Previous code:\n```python\n{previous_code}\n```\n\n"
                
                error_context += "The previously generated code failed because of these issues, please re-write the code to address them.\nIf the errors are not clear or useful please write the code again based on the instructions and available functions.\nAssume you are more capable than the agent that generated the previous attempt and you can make better decisions."
            
            example_messages = [
                {"role": "human" if i % 2 == 0 else "assistant", "content": content}
                for example in relevant_examples
                for i, content in enumerate([example["task"], example["code"]])
            ]
            
            # Use the generic language model for the completion
            messages = [
                SystemMessage("You are a useful technical assistant."),
                SystemMessage(ADHOC_PROMPT_TEXT),
                *[HumanMessage(content=msg["content"]) if msg["role"] == "human" else AIMessage(content=msg["content"]) for msg in example_messages],
                *previous_tool_messages,
                HumanMessage(content=f"{user_input}\n\n{error_context}"),
            ]

            # Keep processing responses and tool calls until we get code or hit an error
            function_code = None
            while True:
                response = adhoc_llm.invoke(messages)
                
                # Check if we have tool calls to process
                if response.additional_kwargs and response.additional_kwargs.get("tool_calls"):
                    tool_messages = [response]
                    tool_result_messages = await process_adhoc_tool_calls(
                        response.additional_kwargs["tool_calls"]
                    )
                    tool_messages.extend(tool_result_messages)

                    # Add tool messages and assistant's response to conversation
                    messages.extend(tool_messages)
                    previous_tool_messages.extend(tool_messages)

                    # Continue the loop to get another response
                    continue
                
                # No more tool calls, process the final response
                if 'The request cannot be fulfilled using the available functions' in response.content:
                    raise ValueError(response.content)
                
                function_code = extract_function_code(response.content)
                if not function_code:
                    raise ValueError(f"Failed to parse function code: {response.content}")
                
                # We have valid code, break the loop
                break

            previous_code = function_code
            print("Generated code:", function_code, flush=True)

            result = await capture_and_process_output(execute_generated_function, function_code)
            create_adhoc_log_file(user_input, function_code, result)
            
            return result
        except Exception as e:
            error_message = str(e)
            print(f"Error during execution (attempt {retry_count + 1}): {error_message}", flush=True)
            errors.append(error_message)
            retry_count += 1

            if retry_count == max_retries:
                print(f"Max retries ({max_retries}) reached. Aborting.", flush=True)
                create_adhoc_log_file(user_input, previous_code, '', error=f"Max retries reached. Last error: {error_message}")
                raise ValueError(f"Max retries reached. Last error: {error_message}")

            print(f"Retrying... (attempt {retry_count} of {max_retries})", flush=True)

    # This line should never be reached, but just in case
    raise ValueError("Unexpected error occurred")

async def run_adhoc_task(input: str) -> str:
    try:
        result = await generate_and_execute_adhoc(input["description"])
        # Ensure the result is a string
        if isinstance(result, dict):
            result = json.dumps(result)
        elif not isinstance(result, str):
            result = str(result)
        return result
    except Exception as e:
        print(f"Error during execution: {str(e)}", flush=True)
        traceback.print_exc()
        return f"Error during execution: {str(e)}"

async def get_tool_manual(params: Dict[str, Any]) -> str:
    try:
        name = params["name"]
        if not name:
            raise ValueError("Name is required")
        
        # Get the task name from the function name
        task_name = FUNCTION_NAME_TO_TASK_NAME_MAP[name.replace(".md", "")] or name

        file_name = f"{task_name}.md"
        file_path = os.path.join(TASKS_MANUALS_PATH, file_name)
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Tool manual {file_name} not found")
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as error:
        raise Exception(f"Error reading tool manual: {str(error)}")

agent_tool_schemas = {
    "run_adhoc_task": {
        "description": "A tool for an agent to run custom tasks described in natural language",
        "input": {"description": str},
        "args_schema": create_model(
            "runAdhocTask",
            description=(str, ...) 
        ),
        "output": Any,
        "function": run_adhoc_task
    },
    "get_tool_manual": {
        "description": "A tool for an agent to read a tool manual",
        "input": {"name": str},
        "args_schema": create_model(
            "getToolManual",
            name=(str, ...) 
        ),
        "output": str,
        "function": get_tool_manual
    }
}


agent_tools = create_tools_from_schemas(agent_tool_schemas)