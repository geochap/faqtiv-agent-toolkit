import os
import requests
import argparse
from typing import List, Dict, Union, Any, Optional
from pydantic import BaseModel, Field, create_model
from langchain_core.tools import StructuredTool
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
from openai import OpenAI
import asyncio
import io
import json
from contextlib import redirect_stdout
import base64
import numpy as np
import time
import uuid
import sys
import traceback
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from functools import partial
from fastapi.middleware.cors import CORSMiddleware
from langchain.chat_models.base import BaseChatModel
from langchain.schema import SystemMessage, HumanMessage, AIMessage
from langchain_core.messages import ToolMessage
import pyfiglet
import re
import ast
import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime
import tiktoken
from threading import Lock

EXPECTED_EMBEDDING_DIMENSION = 1536

# Agent lib and functions dependencies
{{ imports }}

# Agent libs
{{ libs }}

# Agent functions
{{ functions }}

# Task name mapping
task_name_map = {{ taskNameMap }}

# Agent tasks
{{ tasks }}

# Task tool schemas
task_tool_schemas = {
{{ taskToolSchemas }}
}

# Examples with pre-computed embeddings
examples_with_embeddings = {{ examples }}

# Initialize embeddings
embeddings = OpenAIEmbeddings(model="text-embedding-ada-002")

def decode_base64_embedding(b64_string):
    decoded_bytes = base64.b64decode(b64_string)
    return np.frombuffer(decoded_bytes, dtype=np.float32)

# Create vector store from pre-computed embeddings
texts = [json.dumps({**example['document'], 'embedding': None}) for example in examples_with_embeddings]
embeddings_list = [decode_base64_embedding(example['taskEmbedding']) for example in examples_with_embeddings]
metadatas = [{}] * len(examples_with_embeddings)

# Convert list of numpy arrays to 2D numpy array
embeddings_array = np.array(embeddings_list)

vector_store = FAISS.from_embeddings(
    text_embeddings=list(zip(texts, embeddings_list)),
    embedding=embeddings,
    metadatas=metadatas
)

def get_embedding(text):
    text = text.replace("\n", " ")
    return embeddings.embed_query(text)

def get_relevant_examples(query: str, k: int = 10) -> List[Dict]:
    # Generate embedding for the query using the same model as stored embeddings
    query_embedding = get_embedding(query)
 
    # Perform vector search
    results = vector_store.similarity_search_by_vector(query_embedding, k=k)

    relevant_examples = []
    for doc in results:
        example = json.loads(doc.page_content)
        relevant_examples.append({
            "task": example["task"],
            "code": example["code"]
        })
    
    return relevant_examples

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

# Create tools from schemas
task_tools = create_tools_from_schemas(task_tool_schemas)

adhoc_promptText = """{{ generateAnsweringFunctionPrompt }}"""

# Read the API key and model from environment variables
api_key = os.getenv('OPENAI_API_KEY')
model = os.getenv('OPENAI_MODEL')

# Initialize the adhoc language model
adhoc_llm: BaseChatModel = ChatOpenAI(model=model)

def clean_code_block(block):
    # Remove the opening code block tag and optional language identifier
    block = re.sub(r'```[\w]*\n?', '', block)
    # Remove the closing code block tag
    block = re.sub(r'```\s*$', '', block)
    return block.strip()

def extract_function_code(input_text, target_function_name='doTask'):
    cleaned_text = clean_code_block(input_text)
    tree = ast.parse(cleaned_text)
    
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == target_function_name:
            return ast.get_source_segment(cleaned_text, node)
    
    return ''

async def execute_generated_function(function_code):
    # Create a temporary module to execute the function
    import types
    module = types.ModuleType("temp_module")
    
    # Add necessary imports to the module
    module.__dict__.update(globals())
    
    # Execute the function code in the module's context
    exec(function_code, module.__dict__)
    
    # Call the doTask function
    result = module.doTask()
    
    # If the result is a coroutine, await it
    if asyncio.iscoroutine(result):
        result = await result
    
    return result

# Logging
log_dir = os.path.join(os.getcwd(), 'logs')
logs_file_path = os.path.join(log_dir, 'app.log')
error_logs_file_path = os.path.join(log_dir, 'err.log')

os.makedirs(log_dir, exist_ok=True)

class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            'timestamp': self.formatTime(record, self.datefmt),
            'level': record.levelname,
            'message': record.getMessage(),
        }
        if record.exc_info:
            log_record['exception'] = self.formatException(record.exc_info)
        return json.dumps(log_record)

app_logger = logging.getLogger('app')
app_logger.setLevel(logging.INFO)
app_logger.propagate = False

error_logger = logging.getLogger('error')
error_logger.setLevel(logging.ERROR)
error_logger.propagate = False

app_file_handler = RotatingFileHandler(logs_file_path, maxBytes=10*1024*1024, backupCount=5)
app_file_handler.setFormatter(JsonFormatter())
app_logger.addHandler(app_file_handler)

error_file_handler = RotatingFileHandler(error_logs_file_path, maxBytes=10*1024*1024, backupCount=5)
error_file_handler.setFormatter(JsonFormatter())
error_logger.addHandler(error_file_handler)

def log(command, event, body):
    app_logger.info(json.dumps({
        'command': command,
        'event': event,
        'body': body
    }))

def log_err(command, event, body, error):
    log_error = str(error) if error else None
    error_logger.error(json.dumps({
        'command': command,
        'event': event,
        'body': body,
        'error': log_error
    }))

def create_adhoc_log_file(description, code, result, error=None):
    timestamp = datetime.now().isoformat().replace(':', '-').replace('.', '-')
    log_file_name = os.path.join(log_dir, f"adhoc-{timestamp}{'-error' if error else ''}.log")
    
    delimiter = '\n\n---\n\n'

    if isinstance(result, dict):
        pretty_result = json.dumps(result, indent=2)
    else:
        try:
            # Try to parse result as JSON if it's a string
            pretty_result = json.dumps(json.loads(result), indent=2)
        except (json.JSONDecodeError, TypeError):
            # If parsing fails or result is not a string, use it as is
            pretty_result = str(result)

    log_content = delimiter.join([
        f"Description: \n\n {description}",
        f"Code: \n\n {code}",
        f"Result: \n\n {pretty_result}",
        f"Error: {error}" if error else ''
    ])

    with open(log_file_name, 'w') as f:
        f.write(log_content)

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
                SystemMessage(adhoc_promptText),
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

# http agent

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)
@app.middleware("http")
async def increase_request_body_size(request: Request, call_next):
    request.scope["max_body_size"] = 10 * 1024 * 1024  # 10MB in bytes
    response = await call_next(request)
    return response

@app.post("/run_adhoc")
async def run_adhoc_endpoint(request: Request):
    data = await request.json()
    user_input = data["input"]
    request_id = f"run-adhoc-{uuid.uuid4()}"
    log('run_adhoc', 'run_adhoc', {'id': request_id, **data})
    
    try:
        result = await generate_and_execute_adhoc(user_input)
        return JSONResponse(content={"result": result})
    except Exception as e:
        log_err('run_adhoc', 'run_adhoc', {'id': request_id, **data}, e)
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.post("/run_task/{task_name}")
async def run_task_endpoint(task_name: str, request: Request):
    data = await request.json()
    args = data.get("args", {})
    request_id = f"run-task-{uuid.uuid4()}"
    
    log('run_task', task_name, {'id': request_id, **data})
    
    valid_task_name = task_name_map.get(task_name, task_name)
    
    if valid_task_name not in globals():
        log_err('run_task', task_name, {'id': request_id, **data}, 'Not found')
        return {"error": f"Task '{task_name}' not found"}
    
    task_function = globals()[valid_task_name]

    # todo: make sure the args are in the correct positional order
    try:
        result = await capture_and_process_output(task_function, **args)
        return {"result": result}
    except Exception as e:
        log_err('run_task', task_name, {'id': request_id, **data}, e)
        return JSONResponse(content={"error": str(e)}, status_code=500)

class Message(BaseModel):
    role: str
    name: Optional[str] = None
    content: str
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None
    additional_kwargs: Optional[Dict[str, Any]] = None

class CompletionRequest(BaseModel):
    messages: List[Message]
    max_tokens: Optional[int] = Field(default=1000, ge=1, le=4096)
    temperature: Optional[float] = Field(default=0.7, ge=0, le=2)
    stream: Optional[bool] = False
    include_tool_messages: Optional[bool] = False

class CompletionResponse(BaseModel):
    id: str
    object: str
    created: int
    model: str
    choices: List[dict]


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

completion_tool_schemas = {
    "run_adhoc_task": {
        "description": "A tool for an agent to run custom tasks described in natural language",
        "input": {"description": str},
        "args_schema": create_model(
            "runAdhocTask",
            description=(str, ...) 
        ),
        "output": Any,
        "function": run_adhoc_task
    }
}
adhoc_tool = create_tools_from_schemas(completion_tool_schemas)
completion_tools = adhoc_tool + task_tools

completion_promptText = """{{ getAssistantInstructionsPrompt }}"""
completion_prompt = ChatPromptTemplate.from_messages(
    [
        SystemMessage(completion_promptText),
        MessagesPlaceholder("conversation")
    ]
)

# Context management functions
encoder_cache = {}
encoder_mutex = Lock()

def create_encoder(model_name):
    if 'gpt-4' in model_name or 'gpt-3.5' in model_name:
        return tiktoken.encoding_for_model(model_name)
    return tiktoken.get_encoding('cl100k_base')

# Using Lock to prevent race conditions
# Recreates the encoder if it has been used more than 25 times to avoid memory leaks
def get_encoder(model_name):
    with encoder_mutex:
        if model_name not in encoder_cache or encoder_cache[model_name]['count'] >= 25:
            if model_name in encoder_cache and hasattr(encoder_cache[model_name]['encoder'], 'free'):
                encoder_cache[model_name]['encoder'].free()
            encoder_cache[model_name] = {'encoder': create_encoder(model_name), 'count': 0}
    return encoder_cache[model_name]

def get_tokens(model_name, text):
    encoder_data = get_encoder(model_name)
    encoder_data['count'] += 1
    return len(encoder_data['encoder'].encode(text))

model_limits = {
    'gpt-3.5': 16000,
    'gpt-4o': 42000,
}

def get_model_limit(model):
    return next((limit for key, limit in model_limits.items() if key in model), None)

def is_assistant_with_tool_calls(message):
    return message.role == 'assistant' and message.tool_calls

# Update this function to work directly with Message objects
def get_messages_within_context_limit(model: str, messages: List[Message]) -> List[Message]:
    context_limit = get_model_limit(model)
    if not context_limit:
        raise ValueError(f"Unknown context limit for model {model}")
    if not messages:
        return messages

    total_tokens = 0

    # Copy the original messages list
    messages_copy = messages.copy()

    limit_reached = False

    print("Messages count: ", len(messages), flush=True)

    # First Pass: Include user and assistant messages without tool_calls
    i = len(messages_copy) - 1
    while i >= 0:
        message = messages_copy[i]
        if (
            message.role == 'user' or
            (message.role == 'assistant' and not is_assistant_with_tool_calls(message))
        ):
            tokens = get_tokens(model, message.content or '')
            if total_tokens + tokens <= context_limit:
                total_tokens += tokens
                i -= 1
            else:
                # Token limit reached before getting to the first user message
                # Remove all remaining messages from index 0 to i (inclusive)
                del messages_copy[:i+1]
                limit_reached = True
                break
        else:
            # Skip other messages in the first pass
            i -= 1

    print("First pass messages: ", len(messages_copy), flush=True)
    print("First pass tokens: ", total_tokens, flush=True)

    # If limit is reached with just user and assistant messages, remove all tool messages
    if limit_reached:
        messages_copy = [
            msg for msg in messages_copy
            if not (
                (msg.role == 'assistant' and is_assistant_with_tool_calls(msg)) or
                msg.role == 'tool'
            )
        ]
        return messages_copy

    # Second Pass: Include tool message blocks (assistant tool calls and tool results) that fit within the context limit
    i = len(messages_copy) - 1
    while i >= 0:
        message = messages_copy[i]

        if message.role == 'tool':
            # Start of a tool block
            block_end_index = i
            block_start_index = i

            # Find the start of the tool block
            while (
                block_start_index - 1 >= 0 and
                (messages_copy[block_start_index - 1].role == 'tool' or
                 is_assistant_with_tool_calls(messages_copy[block_start_index - 1]))
            ):
                block_start_index -= 1

            if not is_assistant_with_tool_calls(messages_copy[block_start_index]):
                # No assistant tool_calls message found, skip this incomplete block
                num_elements_to_remove = block_end_index - block_start_index + 1
                del messages_copy[block_start_index:block_start_index + num_elements_to_remove]

                i = block_start_index - 1
                continue

            # Collect tokens for the entire block
            block_tokens = 0
            for j in range(block_start_index, block_end_index + 1):
                block_message = messages_copy[j]
                tokens = get_tokens(model, block_message.content or '')
                block_tokens += tokens

            if total_tokens + block_tokens <= context_limit:
                total_tokens += block_tokens
            else:
                # Remove the entire block from messages_copy
                num_elements_to_remove = block_end_index - block_start_index + 1
                del messages_copy[block_start_index:block_start_index + num_elements_to_remove]
                print("Removed block of tokens: ", block_tokens, flush=True)
                print("Block message count: ", num_elements_to_remove, flush=True)
                print("Current tokens: ", total_tokens, flush=True)
                print("Limit: ", context_limit, flush=True)
            # Move to the next message before the block
            i = block_start_index - 1
        else:
            # Other messages are left untouched
            i -= 1

    print("Second pass messages: ", len(messages_copy), flush=True)
    print("Second pass tokens: ", total_tokens, flush=True)

    return messages_copy

# Update the completions endpoint to use the new context management
@app.post("/completions")
async def completions_endpoint(request: CompletionRequest):
    completion_id = f"cmpl-{uuid.uuid4()}"
    stream = request.stream
    messages = request.messages
    include_tool_messages = request.include_tool_messages
    max_tokens = request.max_tokens
    temperature = request.temperature

    log_body = {
        'id': completion_id,
        'stream': stream,
        'prompt': messages[-1].content if messages else "",
        'messageCount': len(messages),
        'include_tool_messages': include_tool_messages,
        'max_tokens': max_tokens,
        'temperature': temperature
    }
    log('completions', 'completions', log_body)

    print("Completion request: ", messages[-1].content if messages else "", flush=True)

    try:
        truncated_messages = get_messages_within_context_limit(model, messages)
        if stream:
            return StreamingResponse(stream_completion_wrapper(completion_id, truncated_messages, include_tool_messages, max_tokens, temperature), media_type="text/event-stream")
        else:
            return await generate_completion(completion_id, truncated_messages, include_tool_messages, max_tokens, temperature)
    except Exception as e:
        print(f"Error during completion: {e}", flush=True)
        log_err('completions', 'completions', log_body, e)
        raise HTTPException(status_code=500, detail=str(e))

async def process_tool_calls(tool_calls):
    tool_messages = [
        AIMessage(
            content='',
            additional_kwargs={'tool_calls': tool_calls}
        )
    ]

    for tool_call in tool_calls:
        print("Calling tool:", tool_call["function"]["name"], tool_call["function"]["arguments"], flush=True)

        tool = next((t for t in completion_tools if t.name == tool_call["function"]["name"]), None)
        if tool:
            try:
                tool_result = await tool.coroutine(json.loads(tool_call["function"]["arguments"]))
                print("Tool result:", tool_result, flush=True)
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

def get_conversation_from_messages_request(messages):
    def create_ai_message(msg):
        content = msg.content
        additional_kwargs = {}
        if hasattr(msg, 'tool_calls') and msg.tool_calls:
            additional_kwargs['tool_calls'] = msg.tool_calls
        return AIMessage(content=content, additional_kwargs=additional_kwargs)

    return [
        HumanMessage(msg.content) if msg.role == 'user'
        else create_ai_message(msg) if msg.role == 'assistant'
        else ToolMessage(content=msg.content, tool_call_id=msg.tool_call_id, name=msg.name) if msg.role == 'tool'
        else SystemMessage(msg.content) if msg.role == 'system'
        else None
        for msg in messages
        if msg is not None
    ]

def convert_ai_message_to_openai_format(ai_message):
    return {
        "role": "assistant",
        "content": ai_message.content,
        "tool_calls": ai_message.additional_kwargs.get("tool_calls", [])
    }

def convert_tool_message_to_openai_format(tool_message):
    return {
        "role": "tool",
        "name": tool_message.name,
        "tool_call_id": tool_message.tool_call_id,
        "content": tool_message.content
    }

async def generate_completion(completion_id, messages, include_tool_messages, max_tokens, temperature):
    llm = ChatOpenAI(
        api_key=api_key,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature
    ).bind_tools(completion_tools)
    completion_chain = completion_prompt.pipe(llm)

    current_time = int(time.time())
    conversation = get_conversation_from_messages_request(messages)
    final_content = ''
    tool_results_messages = []

    async def process_request(input_data):
        try:
            result = completion_chain.invoke(input_data)
            return result
        except Exception as e:
            error_message = str(e)
            if "context length" in error_message.lower() or "too many tokens" in error_message.lower():
                error_response = (
                    f"Error: The tool returned too much data. "
                    "Please try to be more specific or choose a different approach that requires less data."
                )
                # Find the longest tool call result
                tool_messages = [msg for msg in input_data["conversation"] if isinstance(msg, ToolMessage)]
                if tool_messages:
                    longest_tool_message = max(tool_messages, key=lambda x: len(x.content))
                    # Modify the content of the longest tool message
                    longest_tool_message.content = error_response
                
                # Retry with the updated conversation
                retry_input = {
                    "conversation": input_data["conversation"] + [
                        HumanMessage(content="The previous tool call returned too much data. Please adjust your approach and try again.")
                    ]
                }
                return completion_chain.invoke(retry_input)
            else:
                raise

    while not final_content:
        try:
            result = await process_request({"conversation": conversation})

            if result.additional_kwargs and result.additional_kwargs.get("tool_calls"):
                tool_messages = await process_tool_calls(result.additional_kwargs["tool_calls"])
                conversation.extend(tool_messages)
                tool_results_messages.extend(tool_messages)
            else:
                final_content = result.content

        except Exception as e:
            print(f"Error during completion: {e}", flush=True)
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    response = CompletionResponse(
        id=completion_id,
        object="chat.completion",
        created=current_time,
        model=model,
        choices=[
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": final_content
                },
                "finish_reason": "stop"
            }
        ]
    )

    if include_tool_messages:
        tool_messages = []
        for message in tool_results_messages:
            openai_message = None
            if isinstance(message, AIMessage):
                openai_message = convert_ai_message_to_openai_format(message)
            elif isinstance(message, ToolMessage):
                openai_message = convert_tool_message_to_openai_format(message)

            if openai_message:
                message_chunk = {
                    "id": completion_id,
                    "object": "chat.completion.chunk",
                    "created": current_time,
                    "model": model,
                    "choices": [{"index": 0, "delta": openai_message, "finish_reason": None}],
                }
                tool_messages.append(message_chunk)
        
        response.tool_messages = tool_messages

    return JSONResponse(content=response.dict())

async def stream_completion_wrapper(completion_id, messages, include_tool_messages, max_tokens, temperature):
    async for event in stream_completion(completion_id, messages, include_tool_messages, max_tokens, temperature):
        yield event

async def stream_completion(completion_id, messages, include_tool_messages, max_tokens, temperature):
    llm = ChatOpenAI(
        api_key=api_key,
        model=model,
        max_tokens=max_tokens,
        temperature=temperature
    ).bind_tools(completion_tools)
    completion_chain = completion_prompt.pipe(llm)

    current_time = int(time.time())
    conversation = get_conversation_from_messages_request(messages)

    async def process_request(input_data):
        try:
            async for event in completion_chain.astream_events(input_data, version="v2"):
                yield event
        except Exception as e:
            error_message = str(e)
            if "context length" in error_message.lower() or "too many tokens" in error_message.lower():
                error_response = (
                    f"Error: The tool returned too much data. "
                    "Please try to be more specific or choose a different approach that requires less data."
                )
                # Find the longest tool call result
                tool_messages = [msg for msg in input_data["conversation"] if isinstance(msg, ToolMessage)]
                if tool_messages:
                    longest_tool_message = max(tool_messages, key=lambda x: len(x.content))
                    # Modify the content of the longest tool message
                    longest_tool_message.content = error_response

                # Retry with the updated conversation
                retry_input = {
                    "conversation": input_data["conversation"] + [
                        HumanMessage(content="The previous tool call returned too much data. Please adjust your approach and try again.")
                    ]
                }
                async for retry_event in completion_chain.astream_events(retry_input, version="v2"):
                    yield retry_event
            else:
                raise

    try:
        insert_newline = False
        while True:
            events = process_request({"conversation": conversation})
            has_tool_calls = False
            async for event in events:
                if insert_newline:
                    # insert a newline before processing new tokens
                    newline_chunk = {
                        'id': completion_id,
                        'object': 'chat.completion.chunk',
                        'created': current_time,
                        'model': model,
                        'choices': [{'index': 0, 'delta': {'role': 'assistant', 'content': '\n'}, 'finish_reason': None}]
                    }
                    yield f"data: {json.dumps(newline_chunk)}\n\n"
                    insert_newline = False # reset the flag after inserting newline

                if event['event'] == 'on_chat_model_stream':
                    content = event['data']['chunk'].content
                    if content:
                        token_chunk = {
                            'id': completion_id,
                            'object': 'chat.completion.chunk',
                            'created': current_time,
                            'model': model,
                            'choices': [{'index': 0, 'delta': {'role': 'assistant', 'content': content}, 'finish_reason': None}]
                        }
                        yield f"data: {json.dumps(token_chunk)}\n\n"
                elif event['event'] == 'on_chain_end':
                    if event['data']['output'].additional_kwargs.get('tool_calls'):
                        tool_calls = event['data']['output'].additional_kwargs['tool_calls']
                        tool_messages = await process_tool_calls(tool_calls)
                        conversation.extend(tool_messages)
                        has_tool_calls = True
                        insert_newline = True # set flag to insert newline before next tokens

                        # Include tool messages only if includeToolMessages is true
                        if include_tool_messages:
                            for message in tool_messages:
                                openai_message = None
                                if isinstance(message, AIMessage):
                                    openai_message = convert_ai_message_to_openai_format(message)
                                elif isinstance(message, ToolMessage):
                                    openai_message = convert_tool_message_to_openai_format(message)

                                if openai_message:
                                    message_chunk = {
                                        "id": completion_id,
                                        "object": "chat.completion.chunk",
                                        "created": current_time,
                                        "model": model,
                                        "choices": [{'index': 0, 'delta': openai_message, 'finish_reason': None}],
                                    }   
                                    yield f"data: {json.dumps(message_chunk)}\n\n"
                    else:
                        final_chunk = {
                            'id': completion_id,
                            'object': 'chat.completion.chunk',
                            'created': current_time,
                            'model': model,
                            'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'stop'}]
                        }
                        yield f"data: {json.dumps(final_chunk)}\n\n"
                        yield "data: [DONE]\n\n"
                        return

            if not has_tool_calls:
                break

    except Exception as error:
        print(f"Error during streaming: {error}", flush=True)
        traceback.print_exc()
        log_err('completions', 'completions', {'id': completion_id}, error)
        error_chunk = {
            'id': completion_id,
            'object': 'chat.completion.chunk',
            'created': current_time,
            'model': model,
            'choices': [{'delta': {}, 'index': 0, 'finish_reason': 'error'}],
            'error': {
                'message': str(error),
                'type': type(error).__name__,
                'param': None,
                'code': None
            }
        }
        yield f"data: {json.dumps(error_chunk)}\n\n"
        yield "data: [DONE]\n\n"

async def async_cliAgent():
    print("Welcome, please type your request. Type 'exit' to quit.")
    chat_history = []

    while True:
        user_input = input("\nYou: ")
        
        if user_input.lower() == 'exit':
            print("Goodbye!")
            break

        print("\nAgent: ", end="", flush=True)
        
        try:
            # Create a CompletionRequest object
            request = CompletionRequest(
                messages=[Message(role="user", content=user_input)],
                stream=True
            )

            full_response = ""

            # Use stream_completion for token streaming
            async for event in stream_completion(request):
                if event.startswith("data: ") and "[DONE]" not in event:
                    data = json.loads(event[6:])
                    if isinstance(data, dict) and 'choices' in data:
                        content = data['choices'][0]['delta'].get('content', '')
                        if content:
                            print(content, end="", flush=True)
                            full_response += content

            print()  # Add a newline after the response

            # Update chat history
            chat_history.append({"role": "user", "content": user_input})
            chat_history.append({"role": "assistant", "content": full_response})

        except Exception as e:
            print(f"\nError during execution: {e}", flush=True)
            traceback.print_exc()

def cliAgent():
    asyncio.run(async_cliAgent())

port = int(os.getenv('PORT')) if os.getenv('PORT') else 8000

if __name__ == "__main__":    
    print(pyfiglet.figlet_format("FAQtiv"), flush=True)

    parser = argparse.ArgumentParser(description="FAQtiv Agent CLI/HTTP Server")
    parser.add_argument("--http", action="store_true", help="Run as HTTP server")
    args = parser.parse_args()

    if args.http:
        import uvicorn
        print("Starting HTTP server...", flush=True)
        print("HTTP server running on port", port, flush=True)
        uvicorn.run(app, host="0.0.0.0", port=port, log_level="error")
    else:
        cliAgent()

