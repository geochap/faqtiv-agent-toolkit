import os
import json
import traceback
import time
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, AIMessage, ToolMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from typing import Any
from pydantic import create_model
from components.logger import log_err
from components.tools import generate_and_execute_adhoc, get_tool_call_description
from constants import TASK_TOOL_SCHEMAS, COMPLETION_PROMPT_TEXT
from components.context_manager import get_messages_within_context_limit
from components.tools import create_tools_from_schemas
from components.types import CompletionResponse

# Create tools from schemas
task_tools = create_tools_from_schemas(TASK_TOOL_SCHEMAS)

# Read the API key and model from environment variables
api_key = os.getenv('OPENAI_API_KEY')
model = os.getenv('OPENAI_MODEL')

if not api_key:
    raise ValueError("OPENAI_API_KEY environment variable is not set")

if not model:
    raise ValueError("OPENAI_MODEL environment variable is not set")

async def run_adhoc_task(input: str, streamWriter=None) -> str:
    try:
        result = await generate_and_execute_adhoc(input["description"], streamWriter)
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

completion_prompt = ChatPromptTemplate.from_messages(
    [
        SystemMessage(COMPLETION_PROMPT_TEXT),
        MessagesPlaceholder("conversation")
    ]
)

async def process_tool_calls(tool_calls, streamWriter=None):
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
                args = json.loads(tool_call["function"]["arguments"])
                tool_call_description = get_tool_call_description(tool_call["function"]["name"], args)
                
                if tool_call_description:
                    streamWriter.writeEvent(tool_call_description, model)
                
                tool_result = await tool.coroutine(args, streamWriter=streamWriter)
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
    truncated_messages = get_messages_within_context_limit(model, messages)
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
        for msg in truncated_messages
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

async def generate_completion(completion_id, messages, params):
    completion_options = set_options_from_env(params)
    includeToolMessages = bool(params.get("include_tool_messages"))

    llm = ChatOpenAI(
        api_key=api_key,
        model=model,
        **completion_options
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

    if includeToolMessages:
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

async def stream_completion(completion_id, messages, params={"include_tool_messages": None, "max_tokens": None, "temperature": None}, streamWriter=None):
    async for event in _stream_completion(completion_id, messages, params, streamWriter):
        yield event

async def _stream_completion(completion_id, messages, params, streamWriter=None):
    includeToolMessages = bool(params.get("include_tool_messages"))
    completion_options = set_options_from_env(params)

    llm = ChatOpenAI(
        api_key=api_key,
        model=model,
        **completion_options
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
                        tool_messages = await process_tool_calls(tool_calls, streamWriter)
                        conversation.extend(tool_messages)
                        has_tool_calls = True
                        insert_newline = True # set flag to insert newline before next tokens

                        # Include tool messages only if includeToolMessages is true
                        if includeToolMessages:
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

def set_options_from_env(options):
    completion_options = {}
    
    # Handle standard parameters
    if os.getenv('OPENAI_FREQUENCY_PENALTY') and options.get('frequencyPenalty') is None:
        completion_options['frequency_penalty'] = float(os.getenv('OPENAI_FREQUENCY_PENALTY'))
    elif options.get('frequencyPenalty') is not None:
        completion_options['frequency_penalty'] = float(options.get('frequency_penalty'))
        
    if os.getenv('OPENAI_TOP_P') and options.get('topP') is None:
        completion_options['top_p'] = float(os.getenv('OPENAI_TOP_P'))
    elif options.get('topP') is not None:
        completion_options['top_p'] = float(options.get('top_p'))
    
    # Handle temperature - ensure we don't lose this value
    if options.get('temperature') is not None:
        completion_options['temperature'] = float(options.get('temperature'))
    
    # Handle max tokens - ensure we don't lose this value
    if options.get('max_tokens') is not None:
        completion_options['max_tokens'] = int(options.get('max_tokens'))
    
    # We don't pass include_tool_messages to the LLM, it's used elsewhere
    
    return completion_options
