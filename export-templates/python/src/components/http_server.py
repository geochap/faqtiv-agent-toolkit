import os
import uuid
import json
import asyncio
from typing import Callable
import uvicorn
from starlette.responses import Response
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from constants import TASK_NAME_TO_FUNCTION_NAME_MAP, TASKS
from components.completions import stream_completion, generate_completion
from components.logger import log, log_err
from components.tools import capture_and_process_output, generate_and_execute_adhoc
from components.types import CompletionRequest
import time

class StreamWriter:
    def __init__(self, completion_id: str, response_writer: Callable[[str], None]):
        self.completion_id = completion_id
        self.response_writer = response_writer

    def writeEvent(self, data: str, model: str = None):
        event_chunk = {
            "id": self.completion_id,
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": model,
            "choices": [{
                "index": 0,
                "delta": {
                    "role": "assistant",
                    "content": f"\n```agent-message\n{data}\n```\n"
                },
                "finish_reason": None
            }]
        }
        self.response_writer(f"data: {json.dumps(event_chunk)}\n\n")

    def writeRaw(self, data: str, model: str = None):
        chunk = {
            "id": self.completion_id,
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": model,
            "choices": [{
                "index": 0,
                "delta": {
                    "role": "assistant",
                    "content": f"{data}"
                },
                "finish_reason": None
            }]
        }
        self.response_writer(f"data: {json.dumps(chunk)}\n\n")

app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    
    valid_task_name = TASK_NAME_TO_FUNCTION_NAME_MAP.get(task_name, task_name)
    
    if valid_task_name not in TASKS.__dict__:  # Check if method exists in class
        log_err('run_task', task_name, {'id': request_id, **data}, 'Not found')
        return {"error": f"Task '{task_name}' not found"}
    
    task_function = getattr(TASKS, valid_task_name)  # Get the static method

    # todo: make sure the args are in the correct positional order
    try:
        result = await capture_and_process_output(task_function, **args)
        return {"result": result}
    except Exception as e:
        log_err('run_task', task_name, {'id': request_id, **data}, e)
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.post("/completions")
async def completions_endpoint(request: CompletionRequest, raw_request: Request):
    completion_id = f"cmpl-{uuid.uuid4()}"
    messages = request.messages
    include_tool_messages = request.include_tool_messages
    max_tokens = request.max_tokens
    temperature = request.temperature
    stream = request.stream

    log_body = {
        'id': completion_id,
        'prompt': messages[-1].content if messages else "",
        'messageCount': len(messages),
        'include_tool_messages': include_tool_messages,
        'max_tokens': max_tokens,
        'temperature': temperature,
        'stream': stream
    }
    log('completions', 'completions', log_body)

    print("Completion request: ", messages[-1].content if messages else "", flush=True)

    try:
        is_streaming = stream or raw_request.headers.get('accept') == 'text/event-stream'
        if is_streaming:
            async def stream_response():
                # Create a queue for all events (both completion chunks and emitted events)
                chunk_queue = asyncio.Queue()
                
                def write_chunk(chunk):
                    chunk_queue.put_nowait(chunk)

                streamWriter = StreamWriter(completion_id, write_chunk)
                completion_task = asyncio.create_task(
                    stream_chunks(stream_completion(completion_id, messages, include_tool_messages, max_tokens, temperature, streamWriter), chunk_queue)
                )

                try:
                    while True:
                        chunk = await chunk_queue.get()
                        if chunk == "[DONE]":  # Special marker for completion end
                            break
                        yield chunk
                finally:
                    if not completion_task.done():
                        completion_task.cancel()
                    
            return StreamingResponse(stream_response(), media_type="text/event-stream")
        else:
            return await generate_completion(completion_id, messages, include_tool_messages, max_tokens, temperature)
    except Exception as e:
        print(f"Error during completion: {e}", flush=True)
        log_err('completions', 'completions', log_body, e)
        raise HTTPException(status_code=500, detail=str(e))

async def stream_chunks(generator, queue):
    """Helper function to stream chunks from a generator into a queue."""
    try:
        async for chunk in generator:
            await queue.put(chunk)
    finally:
        await queue.put("[DONE]")  # Signal that the stream is complete

shutdown_key = os.getenv('SHUTDOWN_KEY')
if shutdown_key:
    @app.post("/shutdown")
    async def shutdown_endpoint(request: Request):
        data = await request.json()
        key = data.get('key')
        
        print('Received shutdown request')
        
        if key != shutdown_key:
            raise HTTPException(status_code=403, detail="Invalid shutdown key")
        
        async def shutdown():
            await asyncio.sleep(1)  # Brief delay to allow response to be sent
            import sys
            sys.exit(0)
        
        asyncio.create_task(shutdown())
        return Response("Shutting down server", status_code=200)

def start_http_server():
    port = int(os.getenv('PORT', 8000))
    print("Starting HTTP server...", flush=True)
    print("HTTP server running on port", port, flush=True)
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="error")