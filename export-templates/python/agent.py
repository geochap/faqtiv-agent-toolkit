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

async def capture_and_process_output(func, *args, **kwargs):
    f = io.StringIO()
    try:
        with redirect_stdout(f):
            result = await func(*args, **kwargs) if asyncio.iscoroutinefunction(func) else func(*args, **kwargs)
        
        output = f.getvalue()
        
        try:
            processed_result = json.loads(output)
        except json.JSONDecodeError:
            processed_result = output.strip()
        
        return processed_result
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

adhoc_promptText = """
{{ generateAnsweringFunctionPrompt }}
- Wrap the single doTask function in a python code block
"""

# Read the API key and model from environment variables
api_key = os.getenv('OPENAI_API_KEY')
model = os.getenv('OPENAI_MODEL')

# Initialize the adhoc language model
adhoc_llm: BaseChatModel = ChatOpenAI(model=model)

def extract_function_code(response):
    # Extract the code block from the response
    start = response.find("```python")
    end = response.find("```", start + 1)
    if start != -1 and end != -1:
        return response[start+9:end].strip()
    return None

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

async def generate_and_execute_adhoc(user_input: str, max_retries: int = 3):
    retry_count = 0
    errors = []
    previous_code = None

    # Get relevant examples
    relevant_examples = get_relevant_examples(user_input)

    while retry_count <= max_retries:
        try:
            # Prepare the prompt with error information if available
            error_context = ""
            if errors:
                error_context = f"Previous attempt failed with error: {errors[-1]}\n"
                if previous_code:
                    error_context += f"Previous code:\n{previous_code}\n"
                error_context += "Please fix the issue and try again.\n"
            
            example_messages = [
                {"role": "human" if i % 2 == 0 else "assistant", "content": content}
                for example in relevant_examples
                for i, content in enumerate([example["task"], example["code"]])
            ]
            
            # Use the generic language model for the completion
            messages = [
                SystemMessage(content=adhoc_promptText),
                *[HumanMessage(content=msg["content"]) if msg["role"] == "human" else AIMessage(content=msg["content"]) for msg in example_messages],
                HumanMessage(content=f"{error_context}{user_input}")
            ]
            response = await adhoc_llm.agenerate([messages])
            
            function_code = extract_function_code(response.generations[0][0].text)

            if not function_code:
                raise ValueError("Failed to generate function code")
            if function_code:
                previous_code = function_code

            print("Generated code:", function_code, flush=True)

            result = await capture_and_process_output(execute_generated_function, function_code)
            return result

        except Exception as e:
            error_message = str(e)
            print(f"Error during execution (attempt {retry_count + 1}): {error_message}", flush=True)
            errors.append(error_message)
            retry_count += 1

            if retry_count > max_retries:
                print(f"Max retries ({max_retries}) reached. Aborting.", flush=True)
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

@app.post("/run_adhoc")
async def run_adhoc_endpoint(request: Request):
    data = await request.json()
    user_input = data["input"]
    
    try:
        result = await generate_and_execute_adhoc(user_input)
        return JSONResponse(content={"result": result})
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.post("/run_task/{task_name}")
async def run_task_endpoint(task_name: str, request: Request):
    data = await request.json()
    args = data.get("args", {})
    
    valid_task_name = task_name_map.get(task_name, task_name)
    
    if valid_task_name not in globals():
        return {"error": f"Task '{task_name}' not found"}
    
    task_function = globals()[valid_task_name]

    # todo: make sure the args are in the correct positional order
    try:
        result = await capture_and_process_output(task_function, **args)
        return {"result": result}
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

class Message(BaseModel):
    role: str
    content: str

class CompletionRequest(BaseModel):
    messages: List[Message]
    max_tokens: Optional[int] = Field(default=1000, ge=1, le=4096)
    temperature: Optional[float] = Field(default=0.7, ge=0, le=2)
    stream: Optional[bool] = False

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

# Initialize OpenAI LLM for completion agent
completion_llm = ChatOpenAI(model=model).bind_tools(completion_tools)
completion_promptText = """{{ getAssistantInstructionsPrompt }}"""
completion_prompt = ChatPromptTemplate.from_messages(
    [
        SystemMessage(completion_promptText),
        MessagesPlaceholder("conversation")
    ]
)
completion_chain = completion_prompt.pipe(completion_llm)

@app.post("/completions")
async def completions_endpoint(request: CompletionRequest):
    print("Completion request: ", request.messages[-1].content if request.messages else "", flush=True)

    try:
        if request.stream:
            return StreamingResponse(stream_completion_wrapper(request), media_type="text/event-stream")
        else:
            return await generate_completion(request)
    except Exception as e:
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
            except Exception as e:
                error_message = f"Error in tool '{tool_call['function']['name']}': {str(e)}"
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

async def generate_completion(request: CompletionRequest):
    current_time = int(time.time())
    completion_id = f"cmpl-{uuid.uuid4()}"

    conversation = [{"role": msg.role, "content": msg.content} for msg in request.messages]
    final_content = ''

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
            else:
                final_content = result.content

        except Exception as e:
            print(f"Error during completion: {e}", flush=True)
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

    completion_response = CompletionResponse(
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
    
    return JSONResponse(content=completion_response.dict())

async def stream_completion_wrapper(request: CompletionRequest):
    async for event in stream_completion(request):
        yield event

async def stream_completion(request: CompletionRequest):
    current_time = int(time.time())
    completion_id = f"cmpl-{uuid.uuid4()}"
    conversation = [{"role": msg.role, "content": msg.content} for msg in request.messages]

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
        while True:
            events = process_request({"conversation": conversation})
            has_tool_calls = False
            async for event in events:
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
    parser = argparse.ArgumentParser(description="FAQtiv Agent CLI/HTTP Server")
    parser.add_argument("--http", action="store_true", help="Run as HTTP server")
    args = parser.parse_args()

    if args.http:
        import uvicorn
        print("Starting HTTP server...")
        uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
    else:
        cliAgent()