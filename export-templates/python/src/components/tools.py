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
from functools import partial
from contextlib import redirect_stdout
from components.examples import get_relevant_examples
from components.parser import extract_function_code
from components.logger import create_adhoc_log_file
from constants import ADHOC_PROMPT_TEXT, LIBS, FUNCTIONS

TOOL_TIMEOUT = int(os.getenv('TOOL_TIMEOUT', 60000)) / 1000

# todo: do we need to handle warn and error logs?
async def capture_and_process_output(func, *args, emit_event=None, **kwargs):
    f = io.StringIO()
    try:
        async def execute():
            with redirect_stdout(f):
                builtins_dict = sys.modules['builtins'].__dict__
                
                def info(*args, **kwargs):
                    if emit_event:
                        emit_event(*args, **kwargs)
                
                builtins_dict['info'] = info

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
async def tool_wrapper(func, *args, emit_event=None, **kwargs):
    # todo: make sure the args are in the correct positional order
    # this code extracts the args map from the object and passes them as individual value arguments
    arguments = args[0] if isinstance(args, tuple) and len(args) == 1 else args
    arguments_json = json.dumps(arguments)
    arguments_map = json.loads(arguments_json)
    positional_args = list(arguments_map.values())
            
    return await capture_and_process_output(func, *positional_args, emit_event=emit_event, **kwargs)

def create_tools_from_schemas(schemas: Dict[str, Dict[str, Any]]) -> List[StructuredTool]:
    tools = []
    for name, schema in schemas.items():
        description = schema["description"]
        if "returns_description" in schema:
            description += f" Returns: {schema['returns_description']}"
        
        if name == "run_adhoc_task":
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

adhoc_llm: BaseChatModel = ChatOpenAI(api_key=api_key, model=model)

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

# Adhoc task execution
async def generate_and_execute_adhoc(user_input: str, max_retries: int = 5):
    retry_count = 0
    errors = []
    previous_code = None

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
                HumanMessage(content=f"{user_input}\n\n{error_context}")
            ]
            response = await adhoc_llm.agenerate([messages])

            if 'The request cannot be fulfilled using the available functions' in response.generations[0][0].text:
                raise ValueError(response.generations[0][0].text)
            
            function_code = extract_function_code(response.generations[0][0].text)

            if not function_code:
                raise ValueError(f"Failed to parse function code: {response.generations[0][0].text}")
            
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