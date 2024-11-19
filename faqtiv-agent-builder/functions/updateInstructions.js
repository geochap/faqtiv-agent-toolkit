/**
 * Updates the instructions for the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @param {string} newInstructions - The new instructions to set.
 * @returns {Promise<void>} A promise that resolves when the instructions are updated.
 * @throws {Error} If there's an error executing the command.
 */
async function updateInstructions(agentDirectoryPath, newInstructions) {
  const escapedInstructions = escapeForShell(newInstructions);
  const args = ['update-instructions', escapedInstructions];
  return await executeAgentCommand(agentDirectoryPath, args);
} 