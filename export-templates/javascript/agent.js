const figlet = require('figlet');
const { startHttpServer } = require('./components/http-server');
const { startCliChat } = require('./components/cli-chat');
const { ENV_VARS } = require('./constants');

if (require.main === module) {
  console.log(figlet.textSync("FAQtiv"));

  for (const [key, value] of Object.entries(ENV_VARS)) {
    process.env[key] = value;
  }

  const args = process.argv.slice(2);
  if (args.includes('--http')) {
    startHttpServer();
  } else {
    startCliChat();
  }
}
