// generateAdHocResponse.js

import { v4 as uuidv4 } from 'uuid';
import CodeAgent from '../ai/code-agent.js';
import * as config from '../config.js';
import OpenAIModel from '../ai/models/openai.js';
import { getNormalizedImport } from '../lib/parse-utils.js';
import { ensureIndexExists, knnQuery } from '../lib/opensearch.js';
import { getEmbedding } from '../lib/openai.js';
import { initializeVectorStore } from '../lib/vector-store.js';

async function getNearestExamples(vectorStore, taskEmbedding, functionsEmbedding, taskWeight = 0.8, functionWeight = 0.2) {
  const taskResults = await vectorStore.searchByTask(taskEmbedding, 10);
  const functionResults = await vectorStore.searchByFunctionsHeader(functionsEmbedding, 10);

  const functionResultsMap = new Map(
    functionResults.map(d => [JSON.parse(d[0].pageContent).id, d[1]])
  );

  let combinedResults = taskResults.map(d => {
    const taskScore = d[1];
    const pageContent = JSON.parse(d[0].pageContent);
    const functionScore = functionResultsMap.get(pageContent.id) || 0;
    const combinedScore = taskWeight * taskScore + functionWeight * functionScore;
    return { pageContent, combinedScore };
  });

  combinedResults.sort((a, b) => b.combinedScore - a.combinedScore);
  return combinedResults.map(d => d.pageContent);
}

export async function getTaskEmbedding(task) {
  const openai = new OpenAIModel(config.openai);
  return await openai.getVector(task);
}

export function formatCode(libs, functions, code) {
  const { runtimeName } = config.project.runtime;
  const commentTokenByRuntime = {
    javascript: { opening: '/**', middle: '*', closing: ' */' },
    python: { opening: '##', middle: '#', closing: '##' },
  };
  const { opening, middle, closing } = commentTokenByRuntime[runtimeName];
  const imports = getDeduplicatedImports(libs, functions);

  let formattedCode = '';
  if (libs.length > 0 || functions.length > 0) {
    formattedCode += `${opening}\n${middle} DEPENDENCIES\n${middle} Warning: these are extracted from your function files.\n${closing}\n\n${imports.join('\n')}`;
  }
  if (libs.length > 0) {
    formattedCode += `\n\n${opening}\n${middle} LIBRARY FUNCTIONS\n${closing}\n\n${libs.map(f => f.code).join('\n\n')}`;
  }
  if (functions.length > 0) {
    formattedCode += `\n\n${opening}\n${middle} PUBLIC FUNCTIONS\n${closing}\n\n${functions.map(f => f.code).join('\n\n')}`;
  }
  formattedCode += `\n\n${opening}\n${middle} GENERATED CODE\n${closing}\n\n${code}`;
  return formattedCode;
}

export function getDeduplicatedImports(libs, functions) {
  const importMap = new Map();
  [...functions.map(f => f.imports), ...libs.map(l => l.imports)].flat().forEach(imp => {
    const { moduleName, importPart } = getNormalizedImport(imp);
    if (!importMap.has(importPart)) {
      importMap.set(importPart, { original: imp, importPart });
    }
  });
  return Array.from(importMap.values()).map(v => v.original);
}

export async function generateResponse(taskName, vectorStore, conversation) {
  const { instructions, functions, libs, functionsHeader } = config.project;

  const embedding = await getTaskEmbedding(conversation[conversation.length - 1].message);
  const examples = await getNearestExamples(vectorStore, embedding, functionsHeader.embedding);

  const aiAgent = new CodeAgent('code-gen', instructions, functions, functionsHeader.signatures, config.openai);
  const response = await aiAgent.generateResponse(conversation, examples);

  const taskSchema = await aiAgent.generateTaskSchema(taskName, response.code);
  const toolCallDescriptionTemplate = await aiAgent.generateToolCallDescriptionTemplate(taskSchema);

  response.code = formatCode(libs, functions, response.code);
  response.task_schema = taskSchema;
  response.tool_call_description_template = toolCallDescriptionTemplate;

  return {
    id: uuidv4(),
    output: response,
    embedding,
    functions_embedding: functionsHeader.embedding
  };
}

export async function generateTaskSchema(doTaskCode, taskName) {
  const { instructions, functions, functionsHeader } = config.project;
  const aiAgent = new CodeAgent('code-gen', instructions, functions, functionsHeader.signatures, config.openai);
  return await aiAgent.generateTaskSchema(taskName, doTaskCode);
}

export async function generateAdHocResponse({ functions, instructions, functionsHeader, conversation, userMessage, useFewShotExamples = true }) {
  let examples = [];

  if (useFewShotExamples){
    const description = userMessage;
    const embedding = await getEmbedding(description);

    if (!process.env.OPENSEARCH_TASK_INDEX) {
      throw new Error('OPENSEARCH_TASK_INDEX environment variable is not set.');
    }

    await ensureIndexExists(process.env.OPENSEARCH_TASK_INDEX, 'taskEmbedding', 1536, {
      task: 'text',
      code: 'text',
      expectedAnswer: 'text',
      evalResult: 'object',
      dataDictionary: 'object',
      createdAt: 'date',
      updatedAt: 'date'
    });

    examples = await knnQuery(
      process.env.OPENSEARCH_TASK_INDEX,
      'taskEmbedding',
      embedding,
      10,
      ['task', 'code']
    );

    const vectorStore = await initializeVectorStore();
    const taskEmbedding = await getTaskEmbedding(description);
    const taskExamples = await getNearestExamples(vectorStore, taskEmbedding, functionsHeader.embedding);

    while (examples.length < 10 && taskExamples.length > 0) {
      examples.push(taskExamples.shift());
    }
  }

  const aiAgent = new CodeAgent('code-gen', instructions, functions, functionsHeader.signatures, config.openai);
  const response = await aiAgent.generateResponse(conversation, examples, true);

  return {
    id: uuidv4(),
    code: response.code,
    plan: response.plan || '(no plan)'
  };
}
