const { lambdaHandler } = require('./components/http-server');
const { ENV_VARS } = require('./constants');

// Set environment variables only if they're not already set by Lambda
for (const [key, value] of Object.entries(ENV_VARS)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

// Keep the CLI functionality only when running directly
if (require.main === module) {
  const figlet = require('figlet');
  const { startHttpServer } = require('./components/http-server');
  const { startCliChat } = require('./components/cli-chat');

  console.log(figlet.textSync("FAQtiv"));

  const args = process.argv.slice(2);
  if (args.includes('--http')) {
    startHttpServer();
  } else {
    startCliChat();
  }
}

exports.handler = lambdaHandler;