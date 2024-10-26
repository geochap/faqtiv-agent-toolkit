const figlet = require('figlet');
const { startHttpServer } = require('./components/http-server');
const { startCliChat } = require('./components/cli-chat');

if (require.main === module) {
  console.log(figlet.textSync("FAQtiv"));

  const args = process.argv.slice(2);
  if (args.includes('--http')) {
    startHttpServer();
  } else {
    startCliChat();
  }
}
