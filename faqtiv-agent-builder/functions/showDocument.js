/**
 * Shows the contents of a single document in the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @param {string} documentName - The name of the document to show.
 * @returns {Promise<string>} A promise that resolves with the document contents.
 * @throws {Error} If there's an error executing the command.
 */
async function showDocument(agentDirectoryPath, documentName) {
  const args = ['show-document', documentName];
  return await executeAgentCommand(agentDirectoryPath, args);
} 