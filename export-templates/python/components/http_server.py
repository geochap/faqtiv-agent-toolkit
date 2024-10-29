import os
import uuid
import uvicorn
import asyncio
from starlette.responses import Response
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from constants import TASK_NAME_TO_FUNCTION_NAME_MAP
from components.completions import stream_completion, generate_completion
from components.logger import log, log_err
from components.tools import capture_and_process_output, generate_and_execute_adhoc
from components.types import CompletionRequest

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
    
    valid_task_name = TASK_NAME_TO_FUNCTION_NAME_MAP.get(task_name, task_name)
    
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
        if stream:
            return StreamingResponse(stream_completion(completion_id, messages, include_tool_messages, max_tokens, temperature), media_type="text/event-stream")
        else:
            return await generate_completion(completion_id, messages, include_tool_messages, max_tokens, temperature)
    except Exception as e:
        print(f"Error during completion: {e}", flush=True)
        log_err('completions', 'completions', log_body, e)
        raise HTTPException(status_code=500, detail=str(e))

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
    port = int(os.getenv('PORT')) if os.getenv('PORT') else 8000
    
    print("Starting HTTP server...", flush=True)
    print("HTTP server running on port", port, flush=True)
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="error")