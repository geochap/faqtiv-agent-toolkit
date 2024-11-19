/**
 * Shows the project configuration for the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @returns {Promise<object>} A promise that resolves with the project configuration.
 * @throws {Error} If there's an error executing the command.
 */
async function showProjectConfig(agentDirectoryPath) {
  const args = ['show-config', '--json'];
  return await executeAgentCommand(agentDirectoryPath, args);
} 