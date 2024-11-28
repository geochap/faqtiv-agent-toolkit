import { SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import TokenUsageLog from './token-usage.js';
import * as config from '../config.js';

export class AI {
  constructor(modelConfig = { model, organization, apiKey }, agentId, tools = []) {
    this.model = new ChatOpenAI({ model: modelConfig.model }).bindTools(tools);
    this.modelName = modelConfig.model;
    this.tokenUsageLog = new TokenUsageLog(agentId);
    this.messages = [new SystemMessage('You are a useful technical assistant.')];
    this.tools = tools;
  }

  async start(systemPrompt, promptMessages, examples, stepName, modelName = this.modelName) {
    if (systemPrompt) {
      this.prompt = ChatPromptTemplate.fromMessages([
        new SystemMessage(systemPrompt),
        new MessagesPlaceholder('messages')
      ]);
    } else {
      this.prompt = ChatPromptTemplate.fromMessages([
        new SystemMessage('You are a useful technical assistant.'),
        new MessagesPlaceholder('messages')
      ]);
    }
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

    let finalResponse;
    while (true) {
      const { response, toolMessages } = await this.backoffInference(this.messages);
      
      if (toolMessages) {
        this.messages.push(...toolMessages);
        continue;
      }
      
      finalResponse = response;
      break;
    }

    await this.tokenUsageLog.updateLog(this.messages, finalResponse.content, modelName, stepName);
    this.messages.push(new AIMessage(finalResponse));
    
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
        const chain = this.prompt.pipe(this.model);
        const response = await chain.invoke({ messages });
        
        if (response.additional_kwargs?.tool_calls?.length > 0) {
          const toolMessages = await this.processToolCalls(response.additional_kwargs.tool_calls);
          return { response, toolMessages };
        }
        
        return { response };
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

  async processToolCalls(toolCalls) {
    const toolMessages = [
      new AIMessage({
        content: '',
        additional_kwargs: { tool_calls: toolCalls }
      })
    ];

    for (const toolCall of toolCalls) {
      const tool = this.tools.find(t => t.name === toolCall.function.name);

      if (config.logging.LOG_DEBUG_AI) {
        console.log("Calling tool:", toolCall.function.name, toolCall.function.arguments);
      }

      if (tool) {
        try {
          const toolResult = await tool.func(JSON.parse(toolCall.function.arguments));
          if (config.logging.LOG_DEBUG_AI) {
            console.log("Tool result:", toolResult);
          }
          toolMessages.push(new ToolMessage({
            content: JSON.stringify({
              type: "tool_result",
              result: toolResult
            }),
            name: toolCall.function.name,
            tool_call_id: toolCall.id,
          }));
        } catch (error) {
          const errorMessage = `Error in tool '${toolCall.function.name}': ${error.message}`;
          if (config.logging.LOG_DEBUG_AI) {
            console.log("Error in tool:", errorMessage);
          }
          toolMessages.push(new ToolMessage({
            content: JSON.stringify({
              type: "tool_result",
              result: { error: errorMessage }
            }),
            name: toolCall.function.name,
            tool_call_id: toolCall.id,
          }));
        }
      } else {
        if (config.logging.LOG_DEBUG_AI) {
          console.log("Tool not found:", toolCall.function.name);
        }
        toolMessages.push(new ToolMessage({
          content: JSON.stringify({
            type: "tool_result",
            result: { error: "Tool not found" }
          }),
          name: toolCall.function.name,
          tool_call_id: toolCall.id,
        }));
      }
    }
    return toolMessages;
  }
}
