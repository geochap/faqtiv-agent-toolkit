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

  async generateResponse(conversation, examples, adHoc=false) {
    const promptMessages = conversation.map((m) => {
      if (m.role === 'user') {
        return new HumanMessage(m.message);
      }
      return new AIMessage(m.message);
    });

    let { code, call } = await stepGenerateAnsweringFunction(this.ai, promptMessages, this.instructions, this.functionsSignatures, examples, adHoc);
    const usedFunctions = extractFunctionNames(code);
    const functions = stepFunctionDependencies(this.ai, usedFunctions, this.functions);

    if (adHoc) code = code + '\n' + call

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
