import tiktoken
from typing import List
from threading import Lock
from components.types import Message

encoder_cache = {}
encoder_mutex = Lock()

model_limits = {
    'gpt-3.5': 16000,
    'gpt-4o': 128000,
    'gpt-4o-2024-11-20': 128000,
}

def create_encoder(model_name):
    # todo: figure out support for gpt-4o-2024-11-20
    model = 'gpt-4o' if 'gpt-4o' in model_name else model_name
    if 'gpt-4' in model_name or 'gpt-3.5' in model_name:
        return tiktoken.encoding_for_model(model)
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

def get_model_limit(model):
    return next((limit for key, limit in model_limits.items() if key in model), model_limits['gpt-4o'])

def is_assistant_with_tool_calls(message):
    return message.role == 'assistant' and message.tool_calls

# Get the messages that fit within the context limit
# This function is used to truncate the messages to fit within the context limit
# Prioritizes user messages and assistant messages over tool messages
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
            # Move to the next message before the block
            i = block_start_index - 1
        else:
            # Other messages are left untouched
            i -= 1

    return messages_copy