const { OpenAIEmbeddings } = require('@langchain/openai');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const { EXAMPLES_WITH_EMBEDDINGS } = require('../constants');

// Initialize embeddings
const embeddings = new OpenAIEmbeddings({
  model: 'text-embedding-ada-002'
});

function decodeBase64Embedding(b64String) {
  const buffer = Buffer.from(b64String, 'base64');
  const decodedArray = new Float32Array(buffer);
  return decodedArray;
}

// Create vector store from pre-computed embeddings
const documents = EXAMPLES_WITH_EMBEDDINGS.map(example => 
  ({ pageContent: JSON.stringify({ ...example.document, embedding: null }), metadata: {} })
);
const embeddingsList = EXAMPLES_WITH_EMBEDDINGS.map(example => 
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