/**
 * Removes a task from the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @param {string} taskName - The name of the task to remove.
 * @returns {Promise<void>} A promise that resolves when the task is removed.
 * @throws {Error} If there's an error executing the command.
 */
async function removeTask(agentDirectoryPath, taskName) {
  const args = ['remove-task', taskName];
  return await executeAgentCommand(agentDirectoryPath, args);
} 