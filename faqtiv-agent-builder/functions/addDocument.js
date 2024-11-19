/**
 * Adds a new document to the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @param {string} name - The name of the document to add.
 * @param {string} content - The content of the document to add.
 * @returns {Promise<void>} A promise that resolves when the document is added.
 * @throws {Error} If there's an error executing the command.
 */
async function addDocument(agentDirectoryPath, name, content) {
  const escapedContent = escapeForShell(content);
  const args = ['add-document', name, escapedContent];
  return await executeAgentCommand(agentDirectoryPath, args);
}
