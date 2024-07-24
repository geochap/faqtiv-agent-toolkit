import { HumanMessage, AIMessage } from '@langchain/core/messages';

import { generateAnsweringFunctionPrompt } from './prompts/generate-answering-function.js';
import { generateAnswerDescriptionPrompt } from './prompts/generate-answer-description.js';
import { extractFunctionCall, extractFunctionCode } from '../lib/parse-utils.js';
import { improveFunctionSignaturesPrompt } from './prompts/improve-function-signatures.js';

function codeResponse(response) {
  try {
    const code = extractFunctionCode(response, 'doTask');
    const call = extractFunctionCall(response, 'doTask');

  if (!code) {
    console.warn('Could not generate an answer from AI response');
    throw new Error('AI message: ' + response);
  }
  
    return { code, call };
  } catch (e) {
    console.warn('Could not generate an answer from AI response');
    console.warn('AI response: ' + response);
    throw e;
  }
}

export async function generateAnsweringFunction(ai, promptMessages, instructions, functionsSignatures, examples = [], adHoc = false) {
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

export async function generateAnswerDescription(ai, taskName, code) {
  const prompt = [
    new HumanMessage(generateAnswerDescriptionPrompt(taskName, code))
  ];
  const messages = await ai.start(null, prompt, [], 'generate-task-schema');
  const response = messages[messages.length - 1].content.trim();

  return response;
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
  const messages = await ai.start(null, promptMessages, examples, 'improve-function-signatures');
  const response = messages[messages.length - 1].content.trim();

  return response;
}