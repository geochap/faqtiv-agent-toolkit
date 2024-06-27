import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { AI } from './ai.js';
import {
  getFunctionDependencies as stepFunctionDependencies,
  generateAnsweringFunction as stepGenerateAnsweringFunction,
  improveFunctionSignatures as stepImproveFunctionSignatures,
  generateAnswerDescription as stepGenerateAnswerDescription
} from './steps.js';
import { extractFunctionNames } from '../lib/parse-utils.js';

export default class AIAgent {
  constructor(id, instructions, functions, functionsSignatures, modelConfig = { model, organization, apiKey }) {
    this.id = id;
    this.ai = new AI(modelConfig, id);
    this.instructions = instructions;
    this.functions = functions;
    this.functionsSignatures = functionsSignatures;
  }

  async generateResponse(conversation, examples) {
    const promptMessages = conversation.map((m) => {
      if (m.role === 'user') {
        return new HumanMessage(m.message);
      }
      return new AIMessage(m.message);
    });

    const code = await stepGenerateAnsweringFunction(this.ai, promptMessages, this.instructions, this.functionsSignatures, examples);
    const usedFunctions = extractFunctionNames(code);
    const functions = stepFunctionDependencies(this.ai, usedFunctions, this.functions);

    return {
      code,
      functions,
      token_usage_logs: this.ai.getTokenUsageLogs()
    };
  }

  async generateTaskSchema(taskName, code) {
    const taskSchema = await stepGenerateAnswerDescription(this.ai, taskName, code);

    return taskSchema;
  }

  async improveFunctionSignatures(functionsCode, signatures) {
    return await stepImproveFunctionSignatures(this.ai, functionsCode, signatures);
  }
}
