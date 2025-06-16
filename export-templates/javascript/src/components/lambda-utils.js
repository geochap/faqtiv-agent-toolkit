const { getOpenAIApiKey } = require('../constants');
const { initializeExamples } = require('./examples');

async function initializeLambda() {
  const apiKey = await getOpenAIApiKey();

  if (!apiKey) throw new Error('OPENAI_API_KEY not found in secret or env var');
  if (!process.env.OPENAI_MODEL) throw new Error('OPENAI_MODEL env var not set');
  if (!process.env.OPENAI_EMBEDDING_MODEL) throw new Error('OPENAI_EMBEDDING_MODEL env var not set');

  await initializeExamples();
}

module.exports = {
  initializeLambda,
};