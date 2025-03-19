import { HumanMessage } from '@langchain/core/messages';
import { AI } from './ai.js';
import { taskJudgePrompt } from './prompts/task-judge.js';

export default class TaskJudgeAgent {
  constructor(id, modelConfig = { model, organization, apiKey }) {
    this.id = id;
    this.ai = new AI(modelConfig, id, []);
  }

  async evaluateTask(validatedTaskDescription, validatedOutput, newTaskDescription, newOutput) {
    const promptText = taskJudgePrompt(
      validatedTaskDescription, 
      validatedOutput, 
      newTaskDescription, 
      newOutput
    );
    
    const prompt = [new HumanMessage(promptText)];
    
    const messages = await this.ai.start(null, prompt, [], 'evaluate-task');
    const evaluation = messages[messages.length - 1].content.trim();
    
    return evaluation;
  }

  getTokenUsageLogs() {
    return this.ai.getTokenUsageLogs();
  }
} 