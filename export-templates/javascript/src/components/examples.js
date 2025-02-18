const { OpenAIEmbeddings } = require('@langchain/openai');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const fs = require('fs');
const path = require('path');
const { IS_LAMBDA } = require('../constants');

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("OPENAI_API_KEY environment variable is not set");
}

// Initialize embeddings
const embeddings = new OpenAIEmbeddings({
  model: 'text-embedding-ada-002',
  apiKey: apiKey
});

function decodeBase64Embedding(b64String) {
  const buffer = Buffer.from(b64String, 'base64');
  const decodedArray = new Float32Array(buffer);
  return decodedArray;
}

const examplesDirectory = IS_LAMBDA ? path.resolve('/var/task/examples') : path.join(__dirname, '../examples');
const examples = fs.readdirSync(examplesDirectory)
  .filter(file => file.endsWith('.json'))
  .map(file => {
    const content = fs.readFileSync(path.join(examplesDirectory, file), 'utf8');
    return JSON.parse(content);
  });

const documents = examples.map(example => 
  ({ pageContent: JSON.stringify({ ...example.document, embedding: null }), metadata: {} })
);
const embeddingsList = examples.map(example => 
  decodeBase64Embedding(example.taskEmbedding)
);
const vectorStore = new MemoryVectorStore();
vectorStore.addVectors(embeddingsList, documents);

async function getEmbedding(text) {
  text = text.replace("\n", " ")
  return await embeddings.embedQuery(text)
}

async function getRelevantExamples(query, k = 10) {
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
  getRelevantExamples
};