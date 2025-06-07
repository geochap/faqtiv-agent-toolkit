// runAdHocTaskWithJudge.js

import fs from 'fs';
import path from 'path';
import { mkdirpSync } from 'mkdirp';
import * as config from '../config.js';
import { executeCode } from '../lib/runtime.js';
import { unescapeText } from '../lib/shell-utils.js';
import { judgeWithLLM } from '../lib/llmjudge.js';
import { trainOnExample } from '../lib/localsearch-codegen.js';
import { formatCode, generateAdHocResponse } from '../controllers/code-gen.js';
import { generateAnsweringFunctionPrompt } from '../ai/prompts/generate-answering-function.js';

const logDir = path.join(config.project.logsDir, 'adhoc-tasks');

function createLogFile(description, code, contextDocs, toolResult, evalResult, error = null) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFileName = path.join(logDir, `${timestamp}${error ? '-error' : ''}.log`);
  mkdirpSync(path.dirname(logFileName));

  const delimiter = '\n\n---\n\n';

  const prettyPrint = (data) => {
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return data;
    }
  };

  const logContent = [
    `Description:\n\n${description}`,
    delimiter,
    `Code:\n\n${code}`,
    delimiter,
    `Context Docs:\n\n${contextDocs}`,
    delimiter,
    `Tool Results:\n\n${prettyPrint(toolResult)}`,
    delimiter,
    `Eval Results:\n\n${prettyPrint(evalResult)}`,
    error ? `${delimiter}Error:\n\n${error.stack}` : ''
  ].join('');

  fs.writeFileSync(logFileName, logContent);
}

export default async function runAdHocTask(description, options = {}) {
  const canonicalQuestion = unescapeText(description);
  const expectedAnswer = options.answer ? unescapeText(options.answer) : null;
  const { instructions: agentInstructions, functions, libs, functionsHeader } = config.project;
  const codegenInstructions = generateAnsweringFunctionPrompt(agentInstructions, functionsHeader.signatures, true);

  let finalCode = 'N/A';
  let finalResult = 'N/A';
  let toolResult = 'N/A';
  let contextDocs = '';
  let error = null;

  async function generateCode(prompt, bestCandidate, docs) {
    contextDocs = docs;
    const conversation = [
      {
        role: 'user',
        message: `You have the following context to help you answer the question:\n\n${docs}\n\nNow, answer the following task:\n\n${prompt}`
      }
    ];

    if (bestCandidate) {
      const best = bestCandidate;
      let retryMessage = `\n\nThis is retry attempt.\n`;

      if (best.evalResult) {
        const failed = Object.entries(best.evalResult)
          .filter(([_, val]) => val.pass === false && Array.isArray(val.negative))
          .map(([key, val]) => `- ${key}: ${val.negative.join(' ')}`)
          .join('\n');
        if (failed) {
          retryMessage += `The previous attempt failed the following checks:\n${failed}\n`;
        }

        const positiveHints = Object.values(best.evalResult)
          .flatMap(val => Array.isArray(val.positive) ? val.positive : []);
        if (positiveHints.length > 0) {
          retryMessage += `What went well:\n${positiveHints.map(p => `+ ${p}`).join('\n')}\n`;
        }
      }

      if (best.code) {
        retryMessage += `\nPrevious code:\n\n\`\`\`\n${best.code}\n\`\`\``;
      }

      retryMessage += `\nPlease revise the code to improve it further.`;

      conversation[0].message += `\n${retryMessage}`;
    }

    const response = await generateAdHocResponse({
      functions,
      libs,
      instructions: agentInstructions,
      functionsHeader,
      conversation,
      userMessage: canonicalQuestion,
      useFewShotExamples: bestCandidate?false:true
    });

    const formatted = formatCode(libs, functions, response.code);
    finalCode = formatted;

    return {
      codeWithDependencies: formatted,
      code: response.code,
      plan: response.plan
    };
  }

  async function wrapJudge({ question, expectedAnswer, instructions, code, toolData }) {
    toolResult = toolData;
    return await judgeWithLLM({ question, expectedAnswer, instructions, code, toolData });
  }

  try {
    const result = await trainOnExample({
      canonicalQuestion,
      expectedAnswer,
      codegenInstructions,
      generateCode,
      executeGeneratedCode: executeCode,
      judgeCode: wrapJudge,
      batchSize: 4
    });
    finalResult = result?.bestCandidate?.evalResult || 'N/A';
    return result;
  } catch (err) {
    error = err;
    throw err;
  } finally {
    createLogFile(canonicalQuestion, finalCode, contextDocs, toolResult, finalResult, error);
  }
}
