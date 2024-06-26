import { HumanMessage, AIMessage } from '@langchain/core/messages';
import * as config from '../config.js';

import { generateAnsweringFunctionPrompt } from './prompts/generate-answering-function.js';
import { extractFunctionCode } from '../lib/parse-utils.js';
import { improveFunctionSignaturesPrompt } from './prompts/improve-function-signatures.js';

function codeResponse(response) {
  const code = extractFunctionCode(response, 'doTask');

  if (!code) {
    console.log('Could not generate an answer from AI response');
    throw new Error('AI message: ' + response);
  }
  
  return code;
}

export async function generateAnsweringFunction(ai, promptMessages, instructions, functionsSignatures, examples = []) {
  examples = examples.flatMap(e => {
    return [
      new HumanMessage(e.task),
      new AIMessage(e.code)
    ];
  });

  const preprompt = generateAnsweringFunctionPrompt(instructions, functionsSignatures);
  const messages = await ai.start(preprompt, promptMessages, examples, config.openai.model, 'generate-answering-function');
  const response = messages[messages.length - 1].content.trim();

  return codeResponse(response);
}

export function getFunctionDependencies(ai, functionNames, functions) {
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

export async function improveFunctionSignatures(ai, functionsCode, signatures, examples = []) {
  examples = examples.flatMap(e => {
    return [
      new HumanMessage(e.task),
      new AIMessage(e.code)
    ];
  });

  const promptMessages = [new HumanMessage(improveFunctionSignaturesPrompt(functionsCode, signatures))];
  const messages = await ai.start(null, promptMessages, examples, config.openai.model, 'improve-function-signatures');
  const response = messages[messages.length - 1].content.trim();

  return response;
}