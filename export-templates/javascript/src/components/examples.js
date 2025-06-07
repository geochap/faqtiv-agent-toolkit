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
  model: 'text-embedding-3-small',
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

async function findClosestExamplesFromRemoteStore(queryEmbedding, k) {
  const OPENSEARCH_INDEX = process.env.OPENSEARCH_TASK_INDEX;
  const opensearchConfig = {
    node: process.env.OPENSEARCH_URL
  };

  const opensearch = new Client(opensearchConfig);

  const searchResponse = await opensearch.search({
    index: OPENSEARCH_INDEX,
    body: {
      size: k,
      query: {
        bool: {
          must: {
            knn: {
              embedding: {
                vector: queryEmbedding,
                k: k,
              },
            },
          }
        }
      }
    },
  });

  if (searchResponse.statusCode !== 200) {
    console.error('Error in search response:', searchResponse);
    throw new Error('Search failed');
  }

  return searchResponse.body.hits.hits.map((hit) => ({
    id: hit._id,
    task: hit._source.task,
    code: hit._source.code,
    createdAt: hit._source.createdAt,
    updatedAt: hit._source.updatedAt,
    score: hit._score
  }));
}


module.exports = {
  getRelevantExamples
};