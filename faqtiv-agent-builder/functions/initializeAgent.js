/**
 * Initializes a new faqtiv agent in the specified directory.
 *
 * @param {string} agentDirectoryPath - The path where the agent should be initialized.
 * @param {string} [runtime='javascript'] - The runtime environment for the agent.
 * @returns {Promise<void>} A promise that resolves when the agent is initialized.
 * @throws {Error} If there's an error executing the command.
 */
async function initializeAgent(agentDirectoryPath, runtime = 'javascript') {
  const args = ['init', agentDirectoryPath, '--runtime', runtime];
  return await executeAgentCommand(agentDirectoryPath, args);
} 