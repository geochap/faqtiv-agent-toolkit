/**
 * Removes a function from the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @param {string} functionName - The name of the function to remove.
 * @returns {Promise<void>} A promise that resolves when the function is removed.
 * @throws {Error} If there's an error executing the command.
 */
async function removeFunction(agentDirectoryPath, functionName) {
  const args = ['remove-function', functionName];
  return await executeAgentCommand(agentDirectoryPath, args);
} 