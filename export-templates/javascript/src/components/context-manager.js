const tiktoken = require('js-tiktoken');
const { Mutex } = require('async-mutex');

const encoderCache = {};
const encoderMutex = new Mutex();

const modelLimits = {
  'gpt-3.5': 16000,
  'gpt-4o': 128000,
  'gpt-4o-2024-11-20': 128000,
  'o3-mini': 200000,
  'sonar': 127000,
};

function createEncoder(modelName) {
  const model = modelName.includes('gpt-4o') ? 'gpt-4o' : modelName;
  return modelName.includes('gpt-4') || modelName.includes('gpt-3.5')
    ? tiktoken.encodingForModel(model)
    : tiktoken.getEncoding('cl100k_base');
}

// Using async-mutex to prevent race conditions
// Recreates the encoder if it has been used more than 25 times to avoid memory leaks
async function getEncoder(modelName) {
  await encoderMutex.runExclusive(async () => {
    if (!encoderCache[modelName] || encoderCache[modelName].count >= 25) {
      if (encoderCache[modelName] && encoderCache[modelName].encoder.free) {
        encoderCache[modelName].encoder.free();
      }
      encoderCache[modelName] = { encoder: createEncoder(modelName), count: 0 };
    }
  });

  return encoderCache[modelName];
}

async function getTokens(modelName, text) {
  const encoderData = await getEncoder(modelName);
  encoderData.count += 1;
  return encoderData.encoder.encode(text).length;
}

function getModelLimit(model) {
  const matchingModel = Object.keys(modelLimits).find(key => model.includes(key));
  return matchingModel ? modelLimits[matchingModel] : modelLimits['gpt-4o'];
}

function isAssistantWithToolCalls(message) {
  return message.role === 'assistant' && message.tool_calls;
}

// Get the messages that fit within the context limit
// This function is used to truncate the messages to fit within the context limit
// Prioritizes user messages and assistant messages over tool messages
async function getMessagesWithinContextLimit(model, messages) {
  const contextLimit = getModelLimit(model);
  if (!contextLimit) throw new Error(`Unknown context limit for model ${model}`);
  if (!messages || messages.length === 0) return messages;

  let totalTokens = 0;

  // Copy the original messages array
  let messagesCopy = messages.slice(); // Shallow copy

  let limitReached = false;

  // First Pass: Include user and assistant messages without tool_calls
  let i = messagesCopy.length - 1;
  while (i >= 0) {
    const message = messagesCopy[i];
    if (
      message.role === 'user' ||
      (message.role === 'assistant' && !isAssistantWithToolCalls(message))
    ) {
      const tokens = await getTokens(model, message.content || '');
      if (totalTokens + tokens <= contextLimit) {
        totalTokens += tokens;
        i--;
      } else {
        // Token limit reached before getting to the first user message
        // Remove all remaining messages from index 0 to i (inclusive)
        messagesCopy.splice(0, i + 1);
        limitReached = true;
        break;
      }
    } else {
      // Skip other messages in the first pass
      i--;
    }
  }

  // If limit is reached with just user and assistant messages, remove all tool messages
  if (limitReached) {
    messagesCopy = messagesCopy.filter(
      (msg) =>
        !(
          (msg.role === 'assistant' && isAssistantWithToolCalls(msg)) ||
          msg.role === 'tool'
        )
    );
    return messagesCopy;
  }

  // Second Pass: Include tool message blocks (assistant tool calls and tool results) that fit within the context limit
  i = messagesCopy.length - 1;
  while (i >= 0) {
    const message = messagesCopy[i];

    if (message.role === 'tool') {
      // Start of a tool block
      let blockEndIndex = i;
      let blockStartIndex = i;

      // Find the start of the tool block
      while (
        blockStartIndex - 1 >= 0 && 
          (messagesCopy[blockStartIndex - 1].role === 'tool' ||
          isAssistantWithToolCalls(messagesCopy[blockStartIndex - 1]))
      ) {
        blockStartIndex--;
      }

      if (!isAssistantWithToolCalls(messagesCopy[blockStartIndex])) {
        // No assistant tool_calls message found, skip this incomplete block
        const numElementsToRemove = blockEndIndex - blockStartIndex + 1;
        messagesCopy.splice(blockStartIndex, numElementsToRemove);

        i = blockStartIndex - 1;
        continue;
      }

      // Collect tokens for the entire block
      let blockTokens = 0;
      for (let j = blockStartIndex; j <= blockEndIndex; j++) {
        const blockMessage = messagesCopy[j];
        const tokens = await getTokens(model, blockMessage.content || '');
        blockTokens += tokens;
      }

      if (totalTokens + blockTokens <= contextLimit) {
        totalTokens += blockTokens;
      } else {
        // Remove the entire block from messagesCopy
        const numElementsToRemove = blockEndIndex - blockStartIndex + 1;
        messagesCopy.splice(blockStartIndex, numElementsToRemove);
      }
      // Move to the next message before the block
      i = blockStartIndex - 1;
    } else {
      // Other messages are left untouched
      i--;
    }
  }

  return messagesCopy;
}

module.exports = {
  getMessagesWithinContextLimit
};