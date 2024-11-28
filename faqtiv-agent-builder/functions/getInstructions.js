/**
 * Retrieves the instructions for the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @returns {Promise<string>} A promise that resolves with the agent's instructions.
 * @throws {Error} If there's an error executing the command.
 */
async function getInstructions(agentDirectoryPath) {
  const args = ['show-instructions'];
  return await executeAgentCommand(agentDirectoryPath, args);
} 