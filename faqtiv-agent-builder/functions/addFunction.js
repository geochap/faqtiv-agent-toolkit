/**
 * Adds a new function to the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @param {string} functionName - The name of the function to add.
 * @param {string} functionCode - The code for the new function.
 * @returns {Promise<void>} A promise that resolves when the function is added.
 * @throws {Error} If there's an error executing the command.
 */
async function addFunction(agentDirectoryPath, functionName, functionCode) {
  const escapedFunctionCode = escapeForShell(functionCode);
  const args = ['add-function', functionName, escapedFunctionCode];
  return await executeAgentCommand(agentDirectoryPath, args);
}
