import json
import traceback
import asyncio
import uuid
from components.completions import stream_completion
from components.types import Message, CompletionRequest

async def async_cliAgent():
    print("Welcome, please type your request. Type 'exit' to quit.")
    conversation = []

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
            completion_id = f"cli-{uuid.uuid4()}"
            async for event in stream_completion(
                completion_id=completion_id,
                messages=request.messages,
                include_tool_messages=request.include_tool_messages,
                max_tokens=request.max_tokens,
                temperature=request.temperature
            ):
                if event.startswith("data: ") and "[DONE]" not in event:
                    data = json.loads(event[6:])
                    if isinstance(data, dict) and 'choices' in data:
                        content = data['choices'][0]['delta'].get('content', '')
                        if content:
                            print(content, end="", flush=True)
                            full_response += content

            print()  # Add a newline after the response

            # Update chat history
            conversation.append({"role": "user", "content": user_input})
            conversation.append({"role": "assistant", "content": full_response})

        except Exception as e:
            print(f"\nError during execution: {e}", flush=True)
            traceback.print_exc()

def start_cli_chat():
    asyncio.run(async_cliAgent())