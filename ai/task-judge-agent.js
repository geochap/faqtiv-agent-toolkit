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
    const fullResponse = messages[messages.length - 1].content.trim();

    // Extract and parse the JSON part if possible
    try {
      // Look for JSON pattern within the response
      const jsonMatch = fullResponse.match(/```json\s*(\{[\s\S]*?\})\s*```/);

      if (jsonMatch && jsonMatch[1]) {
        const jsonString = jsonMatch[1].trim();
        const jsonAnalysis = JSON.parse(jsonString);

        // Remove the JSON part from the textAnalysis to keep only the pure text analysis
        const textAnalysis = fullResponse
          .replace(/```json\s*\{[\s\S]*?\}\s*```/, '')
          .trim();

        // Return both the cleaned text analysis and the structured JSON
        return {
          textAnalysis,
          jsonAnalysis
        };
      }
    } catch (error) {
      console.warn('Failed to parse JSON from evaluation response:', error);
    }
    
    // If JSON parsing fails, return the full text as before
    return fullResponse;
  }

  getTokenUsageLogs() {
    return this.ai.getTokenUsageLogs();
  }
} 