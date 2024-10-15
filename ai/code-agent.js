import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { AI } from './ai.js';
import { extractFunctionNames } from '../lib/parse-utils.js';
import { generateAnsweringFunctionPrompt } from './prompts/generate-answering-function.js';
import { extractFunctionCode } from '../lib/parse-utils.js';
import { improveFunctionSignaturesPrompt } from './prompts/improve-function-signatures.js';
import { generateLangchainToolSchemaFromFunctionPrompt } from './prompts/generate-langchain-tool-schema-from-function.js';

function codeResponse(response) {
  try {
    if (response.includes('The request cannot be fulfilled using the available functions')) {
      throw new Error('AI error: ' + response);
    }

    const code = extractFunctionCode(response, 'doTask');
    // const call = extractFunctionCall(response, 'doTask');
    // note: this is only needed for ad hoc and values are hardcoded as of the latest prompt instructions
    //       may need to change to support more languages or parametrized calls
    const call = 'doTask()';

    if (!code) {
      console.warn('Could not generate an answer from AI response');
      throw new Error('AI response: ' + response);
    }
  
    return { code, call };
  } catch (e) {
    console.warn('Could not generate an answer from AI response');
    console.warn('AI response: ' + response);
    throw e;
  }
}

async function generateAnsweringFunction(ai, promptMessages, instructions, functionsSignatures, examples = [], adHoc = false) {
  examples = examples.flatMap(e => {
    return [
      new HumanMessage(e.task),
      new AIMessage(e.code)
    ];
  });

  const preprompt = generateAnsweringFunctionPrompt(instructions, functionsSignatures, adHoc);
  const messages = await ai.start(preprompt, promptMessages, examples, 'generate-answering-function');
  const response = messages[messages.length - 1].content.trim();

  return codeResponse(response);
}

export function getFunctionDependencies(functionNames, functions) {
  const functionsByName = {};
  for (let f of functions) {
    functionsByName[f.name] = f;
  }

  const functionObjects = [];
  const seenFns = new Set();

  for (let name of functionNames) {
    const f = functionsByName[name];
    if (f && !seenFns.has(f.name)) {
      seenFns.add(f.name);
      functionObjects.push(f);
    }
  }

  return functionObjects;
}

export default class CodeAgent {
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

    let { code, call } = await generateAnsweringFunction(this.ai, promptMessages, this.instructions, this.functionsSignatures, examples, adHoc);
    const usedFunctions = extractFunctionNames(code);
    const functions = getFunctionDependencies(usedFunctions, this.functions);

    if (adHoc) code = code + '\n' + call

    return {
      code,
      functions,
      token_usage_logs: this.ai.getTokenUsageLogs()
    };
  }

  async generateTaskSchema(taskName, code, functionName = 'doTask') {
    const prompt = [
      new HumanMessage(generateLangchainToolSchemaFromFunctionPrompt(taskName, code, functionName))
    ];
    const messages = await this.ai.start(null, prompt, [], 'generate-task-schema');
    const response = messages[messages.length - 1].content.trim();
  
    return response;
  }

  async improveFunctionSignatures(functionsCode, signatures, examples = []) {
    examples = examples.flatMap(e => {
      return [
        new HumanMessage(e.task),
        new AIMessage(e.code)
      ];
    });
  
    const promptMessages = [new HumanMessage(improveFunctionSignaturesPrompt(functionsCode, signatures))];
    const messages = await this.ai.start(null, promptMessages, examples, 'improve-function-signatures');
    const response = messages[messages.length - 1].content.trim();
  
    return response;
  }
}
