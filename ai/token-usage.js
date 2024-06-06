import * as tiktoken from 'js-tiktoken';

// Ported from langchain source code https://github.com/langchain-ai/langchain/blob/d32e5118265aa305414937e075cd26443cf8e9f8/libs/langchain/langchain/callbacks/openai_info.py
const MODEL_COST_PER_1K_TOKENS = {
  // GPT-4 input
  "gpt-4": 0.03,
  "gpt-4-0314": 0.03,
  "gpt-4-0613": 0.03,
  "gpt-4-32k": 0.06,
  "gpt-4-32k-0314": 0.06,
  "gpt-4-32k-0613": 0.06,
  "gpt-4-vision-preview": 0.01,
  "gpt-4-1106-preview": 0.01,
  "gpt-4-0125-preview": 0.01,
  "gpt-4-turbo-preview": 0.01,
  "gpt-4-turbo-2024-04-09": 0.01,
  "gpt-4-turbo": 0.01,
  "gpt-4o": 0.005,
  "gpt-4o-2024-05-13": 0.005,
  // GPT-4 output
  "gpt-4-completion": 0.06,
  "gpt-4-0314-completion": 0.06,
  "gpt-4-0613-completion": 0.06,
  "gpt-4-32k-completion": 0.12,
  "gpt-4-32k-0314-completion": 0.12,
  "gpt-4-32k-0613-completion": 0.12,
  "gpt-4-vision-preview-completion": 0.03,
  "gpt-4-1106-preview-completion": 0.03,
  "gpt-4-0125-preview-completion": 0.03,
  "gpt-4-turbo-preview-completion": 0.03,
  "gpt-4-turbo-2024-04-09-completion": 0.03,
  "gpt-4-turbo-completion": 0.03,
  "gpt-4o-completion": 0.015,
  "gpt-4o-2024-05-13": 0.015,
  // GPT-3.5 input
  "gpt-3.5-turbo": 0.0015,
  "gpt-3.5-turbo-0301": 0.0015,
  "gpt-3.5-turbo-0613": 0.0015,
  "gpt-3.5-turbo-1106": 0.001,
  "gpt-3.5-turbo-instruct": 0.0015,
  "gpt-3.5-turbo-16k": 0.003,
  "gpt-3.5-turbo-16k-0613": 0.003,
  // GPT-3.5 output
  "gpt-3.5-turbo-completion": 0.002,
  "gpt-3.5-turbo-0301-completion": 0.002,
  "gpt-3.5-turbo-0613-completion": 0.002,
  "gpt-3.5-turbo-1106-completion": 0.002,
  "gpt-3.5-turbo-instruct-completion": 0.002,
  "gpt-3.5-turbo-16k-completion": 0.004,
  "gpt-3.5-turbo-16k-0613-completion": 0.004,
  // Others
  "text-ada-001": 0.0004,
  "ada": 0.0004,
  "text-babbage-001": 0.0005,
  "babbage": 0.0005,
  "text-curie-001": 0.002,
  "curie": 0.002,
  "text-davinci-003": 0.02,
  "text-davinci-002": 0.02,
  "code-davinci-002": 0.02
}

function standardizeModelName(modelName, isCompletion = false) {
  modelName = modelName.toLowerCase();
  if (
    isCompletion && 
      (
        modelName.startsWith("gpt-4") || 
        modelName.startsWith("gpt-3.5") || 
        modelName.startsWith("gpt-35")
      )
  ) 
  {
      return modelName + "-completion";
  }
  
  return modelName;
}

function getOpenAITokenCostForModel(modelName, numTokens, isCompletion = false) {
  modelName = standardizeModelName(modelName, isCompletion);
  if (!(modelName in MODEL_COST_PER_1K_TOKENS)) {
    return 0;
  }
  return MODEL_COST_PER_1K_TOKENS[modelName] * (numTokens / 1000);
}

class TokenUsage {
  /**
   * Represents token usage statistics for a conversation step.
   */
  constructor(agentId, modelName, stepName, promptTokens, completionTokens, tokens) {
    this.agentId = agentId;
    this.modelName = modelName;
    this.stepName = stepName;
    this.promptTokens = promptTokens;
    this.completionTokens = completionTokens;
    this.totalTokens = tokens;
    this.promptTokensCost = getOpenAITokenCostForModel(modelName, promptTokens, false);
    this.completionTokensCost = getOpenAITokenCostForModel(modelName, completionTokens, true);
    this.totalCost = this.promptTokensCost + this.completionTokensCost;
  }
}

class Tokenizer {
  /**
   * Tokenizer for counting tokens in text.
   */
  constructor(modelName) {
    this.modelName = modelName;
    this._tiktokenTokenizer = modelName.includes("gpt-4") || modelName.includes("gpt-3.5")
        ? tiktoken.encodingForModel(modelName)
        : tiktoken.getEncoding("cl100k_base");
  }

  async numTokens(txt) {
    return this._tiktokenTokenizer.encode(txt).length;
  }

  async numTokensFromMessages(messages) {
    let nTokens = 0;
    for (const message of messages) {
      nTokens += 4; // Every message format
      nTokens += await this.numTokens(message.content);
    }
    nTokens += 2; // Every reply is primed
    return nTokens;
  }
}

class TokenUsageLog {
  /**
   * Represents a log of token usage statistics for a conversation.
   */
  constructor(agentId) {
    this.agentId = agentId;
    this._cumulativePromptTokens = 0;
    this._cumulativeCompletionTokens = 0;
    this._cumulativeTotalTokens = 0;
    this._log = [];
    this._tokenizers = {}
  }

  async updateLog(messages, answer, model, stepName) {
    if (!MODEL_COST_PER_1K_TOKENS[model]) {
      return;
    }
    if (!this._tokenizers[model]) {
      this._tokenizers[model] = new Tokenizer(model);
    }

    const tokenizer = this._tokenizers[model];
    const promptTokens = await tokenizer.numTokensFromMessages(messages);
    const completionTokens = await tokenizer.numTokens(answer);
    const totalTokens = promptTokens + completionTokens;

    this._log.push(new TokenUsage(
      this.agentId,
      model,
      stepName,
      promptTokens,
      completionTokens,
      totalTokens
    ));
  }

  getLog() {
    return this._log;
  }
}

export default TokenUsageLog;