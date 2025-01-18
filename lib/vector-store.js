import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import * as config from '../config.js';
import { decodeBase64 } from './base64.js';
import { extractFunctionCode } from '../lib/parse-utils.js';

const metadataDir = config.project.metadataDir;
const tasksDir = config.project.tasksDir;
const codeDir = config.project.codeDir;
const codeFileExtension = config.project.runtime.codeFileExtension;

export default class VectorStore {
  constructor() {
    this.taskVectorStore = new MemoryVectorStore();
    this.functionsVectorStore = new MemoryVectorStore();
  }

  async addTaskVectors(vectors) {
    await this.taskVectorStore.addVectors(vectors.map(x => x.embedding), vectors.map(x => {
      return {
        pageContent: JSON.stringify({
          ...x,
          embedding: undefined
        }),
        metadata: { }
      };
    }));
  }

  async searchByTask(task, k) {
    return await this.taskVectorStore.similaritySearchVectorWithScore(task, k);
  }

  async addFunctionsHeaderVector(vectors) {
    await this.functionsVectorStore.addVectors(vectors.map(x => x.embedding), vectors.map(x => {
      return {
        pageContent: JSON.stringify({
          ...x,
          embedding: undefined
        }),
        metadata: { }
      };
    }));
  }

  async searchByFunctionsHeader(functionsHeader, k) {
    return await this.functionsVectorStore.similaritySearchVectorWithScore(functionsHeader, k);
  }
}

export async function initializeVectorStore( omitTaskNames = [] ) {
  const examples = config.project.taskExamples;
  const vectorStore = new VectorStore();

  console.warn('Initializing vector store...');
  const vectors = [];

  for (const name of examples) {
    if (omitTaskNames.includes(name)) continue;

    const ymlFilePath = path.join(metadataDir, `${name}.yml`);
    const txtFilePath = path.join(tasksDir, `${name}.txt`);
    const jsFilePath = path.join(codeDir, `${name}${codeFileExtension}`);

    if (!fs.existsSync(ymlFilePath)) {
      console.warn(`WARNING: Skipping example task "${name}" because metadata is missing, please run: faqtiv compile-task ${name}`);
      continue;
    }
    if (!fs.existsSync(txtFilePath)) {
      console.warn(`WARNING: Skipping example task "${name}" because description is missing`);
      continue;
    }
    if (!fs.existsSync(jsFilePath)) {
      console.warn(`WARNING: Skipping example task "${name}" because code is missing, please run: faqtiv compile-task ${name}`);
      continue;
    }

    const yamlContent = yaml.load(fs.readFileSync(ymlFilePath, 'utf8'));
    const taskText = fs.readFileSync(txtFilePath, 'utf8');
    const jsFileContent = fs.readFileSync(jsFilePath, 'utf8');
    const doTaskCodeString = extractFunctionCode(jsFileContent, 'doTask');

    vectors.push({
      taskEmbedding: decodeBase64(yamlContent.embedding),
      functionsEmbedding: decodeBase64(yamlContent.functions_embedding),
      document: {
        id: yamlContent.id,
        task: taskText,
        code: doTaskCodeString
      }
    });
  }

  if (vectors.length > 0) {
    await vectorStore.addTaskVectors(vectors.map((v) => ({ embedding: v.taskEmbedding, ...v.document })));
    await vectorStore.addFunctionsHeaderVector(vectors.map((v) => ({ embedding: v.functionsEmbedding, ...v.document })));
  }

  console.warn(`${vectors.length} examples loaded into the vector store...`);
  console.warn('Vector store initialized successfully');

  return vectorStore;
}