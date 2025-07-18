const { lambdaHandler } = require('./components/http-server');
const { ENV_VARS, getOpenAIApiKey } = require('./constants');
const { initializeExamples } = require('./components/examples');

// Set environment variables only if they're not already set by Lambda
for (const [key, value] of Object.entries(ENV_VARS)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

async function initialize() {
  await getOpenAIApiKey();

  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY env var not set');
  if (!process.env.OPENAI_MODEL) throw new Error('OPENAI_MODEL env var not set');
  if (!process.env.OPENAI_EMBEDDING_MODEL) throw new Error('OPENAI_EMBEDDING_MODEL env var not set');

  await initializeExamples();
}

// Keep the CLI functionality only when running directly
if (require.main === module) {
  const figlet = require('figlet');
  const { startHttpServer } = require('./components/http-server');
  const { startCliChat } = require('./components/cli-chat');
  const { initializeExamples } = require('./components/examples');

  console.log(figlet.textSync("FAQtiv"));

  const args = process.argv.slice(2);
  (async () => {
    await initialize();
    if (args.includes('--http')) {
      startHttpServer();
    } else {
      startCliChat();
    }
  })();
}

exports.handler = lambdaHandler;