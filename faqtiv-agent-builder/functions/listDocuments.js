/**
 * Lists all functions in the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @returns {Promise<object>} A promise that resolves with the list of functions.
 * @throws {Error} If there's an error executing the command.
 */
async function listDocuments(agentDirectoryPath) {
  const args = ['list-documents', '--json'];
  return await executeAgentCommand(agentDirectoryPath, args);
} 