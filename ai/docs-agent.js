import { AI } from './ai.js';
import { generateDocSummaryPrompt } from './prompts/generate-doc-summary.js';
import { generateFunctionManualPrompt } from './prompts/generate-function-manual.js';

export default class DocsAgent {
  constructor(id, modelConfig = { model, organization, apiKey }) {
    this.id = id;
    const tools = [];

    this.ai = new AI(modelConfig, id, tools);
  }

  async generateDocDescription(filename, content) {
    const prompt = generateDocSummaryPrompt(filename, content);
  
    const messages = await this.ai.start(prompt, [], [], 'generate-doc-description');
    const response = messages[messages.length - 1].content.trim();

    return response;
  }

  async generateFunctionManual(functionCode, documentsHeader) {
    const prompt = generateFunctionManualPrompt(functionCode, documentsHeader);

    const messages = await this.ai.start(prompt, [], [], 'generate-function-manual');
    const response = messages[messages.length - 1].content.trim();

    return response;
  }
}