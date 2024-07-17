import { SystemMessage, AIMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { StringOutputParser } from "@langchain/core/output_parsers";
import TokenUsageLog from './token-usage.js';
import * as config from '../config.js';

export class AI {
  constructor(modelConfig = { model, organization, apiKey }, agentId) {
    this.model = new ChatOpenAI({ model: modelConfig.model });
    this.modelName = modelConfig.model;
    this.chain = this.model.pipe(new StringOutputParser());
    this.tokenUsageLog = new TokenUsageLog(agentId);
    this.messages = [new SystemMessage('You are a useful technical assistant.')];
  }

  async start(systemPrompt, promptMessages, examples, stepName, modelName = this.modelName) {
    if (systemPrompt) this.messages.push(new AIMessage(systemPrompt));
    return await this.next(promptMessages, examples, stepName, modelName);
  }

  async next(promptMessages, examples, stepName, modelName = this.modelName) {
    if (examples) {
      this.messages.push(...examples);
    }
    if (promptMessages) {
      this.messages.push(...promptMessages);
    }

    if (config.logging.LOG_DEBUG_AI) {
      console.log(`Creating a new chat completion: ${this.messages.map(m => JSON.stringify(m, null, 2)).join('\n\n')}`);
    }

    const response = await this.backoffInference(this.messages);
    await this.tokenUsageLog.updateLog(this.messages, response, modelName, stepName);
    this.messages.push(new AIMessage(response));
    
    if (config.logging.LOG_DEBUG_AI) {
      console.log(`Chat completion finished: ${this.messages.map(m => JSON.stringify(m, null, 2)).join('\n\n')}`);
      console.log('Token usage metrics:');
      console.log(JSON.stringify(this.getTokenUsageLogs(), null, 2));
    }

    return this.messages;
  }

  getTokenUsageLogs() {
    return this.tokenUsageLog.getLog().map(log => ({
      agent_id: log.agentId,
      model_name: log.modelName,
      step_name: log.stepName,
      prompt_tokens: log.promptTokens,
      completion_tokens: log.completionTokens,
      total_tokens: log.totalTokens,
      prompt_tokens_cost: log.promptTokensCost,
      completion_tokens_cost: log.completionTokensCost,
      total_cost: log.totalCost,
      created_at: new Date()
    }));
  }  

  async backoffInference(messages) {  
    const maxRetries = 3;
    let retryCount = 0;
    let delay = 500; // Initial delay of 500ms
    
    while (retryCount < maxRetries) {
      try {
        const response = await this.chain.invoke(messages);
        return response;
      } catch (error) {
        if (retryCount === maxRetries - 1) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        retryCount++;
        delay *= 2;
      }
    }
  }
}
