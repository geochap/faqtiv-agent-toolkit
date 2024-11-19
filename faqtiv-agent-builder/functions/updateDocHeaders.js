/**
 * Updates documentation headers in the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @returns {Promise<void>} A promise that resolves when the headers are updated.
 * @throws {Error} If there's an error executing the command.
 */
async function updateDocHeaders(agentDirectoryPath) {
  const args = ['update-doc-headers'];
  return await executeAgentCommand(agentDirectoryPath, args);
} 