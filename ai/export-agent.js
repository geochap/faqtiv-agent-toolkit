import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { AI } from './ai.js';
import { generateLangchainAgent, examples as exportExamples } from './prompts/generate-langchain-agent.js';

export default class ExportAgent {
  constructor(id, modelConfig = { model, organization, apiKey }) {
    this.id = id;
    this.ai = new AI(modelConfig, id);
  }

  async exportLangchainAgent(instructions, libs, functions, functionsSignatures, examples = []) {
    const prompt = [
      new HumanMessage(generateLangchainAgent(libs, functions, functionsSignatures))
    ];
    examples = examples.flatMap(e => {
      return [
        new HumanMessage(e.task),
        new AIMessage(e.code)
      ];
    });
    examples.push(...exportExamples);
  
    const messages = await this.ai.start(null, prompt, examples, 'generate-langchain-agent');
    const response = messages[messages.length - 1].content.trim();

    return response;
  }
}
