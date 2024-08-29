import os
import requests
import argparse
from typing import List, Dict, Union, Any, Optional
from pydantic import BaseModel, Field, create_model
from langchain_core.tools import StructuredTool
from langchain_core.prompts import ChatPromptTemplate
from langchain.agents import AgentExecutor, create_tool_calling_agent
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
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from langchain.callbacks import AsyncIteratorCallbackHandler
from functools import partial
from fastapi.middleware.cors import CORSMiddleware

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

# Adhoc tool schemas
tool_schemas = {{ adhocToolSchemas }}

# Examples with pre-computed embeddings
examples_with_embeddings = {{ examples }}

# Initialize embeddings
embeddings = OpenAIEmbeddings()

def decode_base64_embedding(b64_string):
    decoded_bytes = base64.b64decode(b64_string)
    embedding = np.frombuffer(decoded_bytes, dtype=np.float32)
    
    if len(embedding) != EXPECTED_EMBEDDING_DIMENSION:
        print(f"Warning: Decoded embedding has unexpected dimension: {len(embedding)}. Adjusting to {EXPECTED_EMBEDDING_DIMENSION}.")
        return adjust_embedding_dimension(embedding)
    
    return embedding

def adjust_embedding_dimension(embedding, target_dim=EXPECTED_EMBEDDING_DIMENSION):
    if len(embedding) < target_dim:
        return np.pad(embedding, (0, target_dim - len(embedding)), 'constant')
    elif len(embedding) > target_dim:
        return embedding[:target_dim]
    return embedding

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

# Initialize OpenAI client
client = OpenAI()

def get_embedding(text, model="text-embedding-ada-002"):
    text = text.replace("\n", " ")
    return client.embeddings.create(input = [text], model=model).data[0].embedding

def get_relevant_examples(query: str, k: int = 10) -> List[Dict]:
    # Generate embedding for the query using the same model as stored embeddings
    query_embedding = get_embedding(query)
    
    # Ensure the query embedding has the correct dimension
    if len(query_embedding) != EXPECTED_EMBEDDING_DIMENSION:
        print(f"Warning: Query embedding dimension ({len(query_embedding)}) does not match expected dimension ({EXPECTED_EMBEDDING_DIMENSION})")
        query_embedding = adjust_embedding_dimension(query_embedding)
 
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

# Capture stdout of tasks
async def tool_wrapper(func, *args, **kwargs):
    return await capture_and_process_output(func, *args, **kwargs)

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

adhoc_promptText = adhoc_promptText.replace("{", "{{").replace("}", "}}") # escape curly braces to avoid template errors

adhoc_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", adhoc_promptText),
        ("placeholder", "{chat_history}"),
        ("human", "{input}"),
        ("placeholder", "{agent_scratchpad}"),
    ]
)
example_prompt = ChatPromptTemplate.from_messages(
    [
        ("human", "{task}"),
        ("ai", "{code}"),
    ]
)

completion_promptText = """{{ getAssistantInstructionsPrompt }}"""

completion_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", completion_promptText),
        ("placeholder", "{chat_history}"),
        ("human", "{input}"),
        ("placeholder", "{agent_scratchpad}"),
    ]
)

# Read the API key and model from environment variables
api_key = os.getenv('OPENAI_API_KEY')
model = os.getenv('OPENAI_MODEL')

# Initialize OpenAI LLM for adhoc tasks
openAIClient = OpenAI(api_key=api_key)

# Initialize OpenAI LLM for completion agent
completion_llm = ChatOpenAI(model=model)

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

async def capture_and_process_output(func, *args, **kwargs):
    f = io.StringIO()
    with redirect_stdout(f):
        await func(*args, **kwargs) if asyncio.iscoroutinefunction(func) else func(*args, **kwargs)
    
    output = f.getvalue()
    
    try:
        processed_result = json.loads(output)
    except json.JSONDecodeError:
        processed_result = output.strip()
    
    return processed_result

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
                {"role": "user" if i % 2 == 0 else "assistant", "content": content}
                for example in relevant_examples
                for i, content in enumerate([example["task"], example["code"]])
            ]
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": adhoc_promptText},
                    *example_messages,
                    {"role": "user", "content": f"{error_context}{user_input}"}
                ]
            )
            function_code = extract_function_code(response.choices[0].message.content)

            if not function_code:
                raise ValueError("Failed to generate function code")
            if function_code:
                previous_code = function_code

            result = await capture_and_process_output(execute_generated_function, function_code)
            return result

        except Exception as e:
            error_message = str(e)
            print(f"Error during execution (attempt {retry_count + 1}): {error_message}")
            errors.append(error_message)
            retry_count += 1

            if retry_count > max_retries:
                print(f"Max retries ({max_retries}) reached. Aborting.")
                raise ValueError(f"Max retries reached. Last error: {error_message}")

            print(f"Retrying... (attempt {retry_count} of {max_retries})")

    # This line should never be reached, but just in case
    raise ValueError("Unexpected error occurred")

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


async def run_adhoc_task(description: str) -> str:
    try:
        result = await generate_and_execute_adhoc(description)
        # Ensure the result is a string
        if isinstance(result, dict):
            result = json.dumps(result)
        elif not isinstance(result, str):
            result = str(result)
        return result
    except Exception as e:
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

# Create an agent for the completion endpoint using the adhoc tool
completion_tools = adhoc_tool + task_tools
completion_agent = create_tool_calling_agent(completion_llm, completion_tools, completion_prompt)
completion_executor = AgentExecutor(agent=completion_agent, tools=completion_tools)

@app.post("/completions")
async def completions_endpoint(request: CompletionRequest):
    try:
        if request.stream:
            return StreamingResponse(stream_completion(request), media_type="text/event-stream")
        else:
            return await generate_completion(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def generate_completion(request: CompletionRequest):
    current_time = int(time.time())
    completion_id = f"cmpl-{uuid.uuid4()}"

    # Prepare the conversation history
    conversation = [{"role": msg.role, "content": msg.content} for msg in request.messages]
    
    # Use the completion executor to process the request
    result = await completion_executor.ainvoke(
        {
            "input": conversation[-1]["content"],
            "chat_history": conversation[:-1]
        }
    )

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
                    "content": result["output"]
                },
                "finish_reason": "stop"
            }
        ]
    )
    
    return JSONResponse(content=completion_response.dict())

async def stream_completion(request: CompletionRequest):
    current_time = int(time.time())
    completion_id = f"cmpl-{uuid.uuid4()}"
    conversation = [{"role": msg.role, "content": msg.content} for msg in request.messages]

    async def process_request(input_data):
        try:
            async for event in completion_executor.astream_events(input_data, version="v2"):
                kind = event["event"]
                if kind == "on_tool_start":
                    current_tool = event["name"]
                yield event
        except Exception as e:
            # Handle tool output context length errors
            error_message = str(e)
            if "context length" in error_message.lower() or "too many tokens" in error_message.lower():
                error_response = (
                    f"Error: The tool '{current_tool}' returned too much data. "
                    "Please try to be more specific or choose a different approach that requires less data."
                )
                # Add the error as a tool call result to the chat history
                input_data["chat_history"].append({
                    "role": "function",
                    "name": current_tool,
                    "content": error_response
                })
                # Retry with the updated chat history
                retry_input = {
                    "input": "The previous tool call returned too much data. Please adjust your approach and try again.",
                    "chat_history": input_data["chat_history"]
                }
                async for retry_event in completion_executor.astream_events(retry_input, version="v2"):
                    yield retry_event
            else:
                # Re-raise other exceptions
                raise

    try:
        async for event in process_request({
            "input": conversation[-1]["content"],
            "chat_history": conversation[:-1]
        }):
            kind = event["event"]
            if kind == "on_chat_model_stream":
                content = event["data"]["chunk"].content
                if content:
                    token_chunk = {
                        'id': completion_id,
                        'object': 'chat.completion.chunk',
                        'created': current_time,
                        'model': model,
                        'choices': [{'index': 0, 'delta': {'role': 'assistant', 'content': content}, 'finish_reason': None}]
                    }
                    yield f"data: {json.dumps(token_chunk)}\n\n"
            elif kind == "on_chain_end" and event["name"] == "AgentExecutor":
                token_chunk = {
                    'id': completion_id,
                    'object': 'chat.completion.chunk',
                    'created': current_time,
                    'model': model,
                    'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'stop'}]
                }
                yield f"data: {json.dumps(token_chunk)}\n\n"
                yield "data: [DONE]\n\n"

    except Exception as e:
        print(f"Error during streaming: {e}", flush=True)
        error_chunk = {
            'id': completion_id,
            'object': 'chat.completion.chunk',
            'created': current_time,
            'model': model,
            'choices': [{'delta': {}, 'index': 0, 'finish_reason': 'error'}],
            'error': {
                'message': str(e),
                'type': type(e).__name__,
                'param': None,
                'code': None
            }
        }
        yield f"data: {json.dumps(error_chunk)}\n\n"
        yield "data: [DONE]\n\n"
        raise

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
            async for event in completion_executor.astream_events(
                {
                    "input": user_input,
                    "chat_history": chat_history
                },
                version="v2"
            ):
                kind = event["event"]
                if kind == "on_chat_model_stream":
                    content = event["data"]["chunk"].content
                    if content:
                        print(content, end="", flush=True)
                elif kind == "on_chain_end" and event["name"] == "Agent":
                    print()  # Add a newline after the response

            # Update chat history
            chat_history.append({"role": "user", "content": user_input})
            chat_history.append({"role": "assistant", "content": event['data'].get('output')['output']})

        except Exception as e:
            print(f"\nError during execution: {e}", flush=True)

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