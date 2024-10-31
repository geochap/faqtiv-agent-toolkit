const readline = require('readline');
const { streamCompletion } = require('./completions');

async function startCliChat() {
  console.log("Welcome, please type your request. Type 'exit' to quit.");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const conversation = [];

  const askQuestion = () => {
    return new Promise((resolve) => {
      rl.question("\nYou: ", (answer) => {
        resolve(answer);
      });
    });
  };

  while (true) {
    const userInput = await askQuestion();

    if (userInput.toLowerCase() === 'exit') {
      console.log("Goodbye!");
      rl.close();
      break;
    }

    process.stdout.write("\nAgent: ");

    try {
      conversation.push({ role: 'user', content: userInput });

      let fullResponse = '';

      for await (const chunk of streamCompletion(conversation)) {
        if (chunk.choices[0].delta.content) {
          const content = chunk.choices[0].delta.content;
          process.stdout.write(content);
          fullResponse += content;
        }
      }

      console.log(); // Add a newline after the response

      conversation.push({ role: 'assistant', content: fullResponse });
    } catch (error) {
      console.error(`\nError during execution: ${error.message}`);
    }
  }
}

module.exports = {
  startCliChat
};