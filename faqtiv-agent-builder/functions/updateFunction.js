/**
 * Updates an existing function in the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @param {string} functionName - The name of the function to update.
 * @param {string} newCode - The new code for the function.
 * @returns {Promise<void>} A promise that resolves when the function is updated.
 * @throws {Error} If there's an error executing the command.
 */
async function updateFunction(agentDirectoryPath, functionName, newCode) {
  const escapedCode = escapeForShell(newCode);
  const args = ['update-function', functionName, escapedCode];
  return await executeAgentCommand(agentDirectoryPath, args);
} 