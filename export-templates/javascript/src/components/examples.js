const { OpenAIEmbeddings } = require('@langchain/openai');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const fs = require('fs');
const path = require('path');
const { IS_LAMBDA, getOpenAIApiKey } = require('../constants');

let embeddings = null;
let vectorStore = null;
let initialized = false;
let documents = null;

function decodeBase64Embedding(b64String) {
  const buffer = Buffer.from(b64String, 'base64');
  const decodedArray = new Float32Array(buffer);
  return decodedArray;
}

async function initializeExamples() {
  const apiKey = await getOpenAIApiKey();

  embeddings = new OpenAIEmbeddings({
    model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    apiKey: apiKey
  });

  const examplesDirectory = IS_LAMBDA ? path.resolve('/var/task/examples') : path.join(__dirname, '../examples');
  const examples = fs.readdirSync(examplesDirectory)
    .filter(file => file.endsWith('.json'))
    .map(file => {
      const content = fs.readFileSync(path.join(examplesDirectory, file), 'utf8');
      return JSON.parse(content);
    });

  documents = examples.map(example => 
    ({ pageContent: JSON.stringify({ ...example.document, embedding: null }), metadata: {} })
  );
  const embeddingsList = examples.map(example => 
    decodeBase64Embedding(example.taskEmbedding)
  );
  vectorStore = new MemoryVectorStore();
  vectorStore.addVectors(embeddingsList, documents);
  initialized = true;
}

async function getEmbedding(text) {
  if (!initialized) throw new Error('examples.js not initialized. Call initializeExamples() first.');
  
  text = text.replace("\n", " ")
  return await embeddings.embedQuery(text)
}

async function getRelevantExamples(query, k = 10) {
  if (!initialized) throw new Error('examples.js not initialized. Call initializeExamples() first.');
  
  const queryEmbedding = await getEmbedding(query);
  const results = await vectorStore.similaritySearchVectorWithScore(queryEmbedding, k);

  const relevantExamples = [];
  for (const doc of results) {
    const example = JSON.parse(doc[0].pageContent);
    relevantExamples.push({
      task: example.task,
      code: example.code
    });
  }
  return relevantExamples;
}

module.exports = {
  initializeExamples,
  getRelevantExamples
};