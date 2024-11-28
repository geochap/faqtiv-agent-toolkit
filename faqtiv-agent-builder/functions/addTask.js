/**
 * Adds a new task to the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @param {string} taskName - The name of the task to add.
 * @param {string} description - The description of the task.
 * @returns {Promise<void>} A promise that resolves when the task is added.
 * @throws {Error} If there's an error executing the command.
 */
async function addTask(agentDirectoryPath, taskName, description) {
  const escapedDescription = escapeForShell(description);
  const args = ['add-task', taskName, escapedDescription];
  return await executeAgentCommand(agentDirectoryPath, args);
}
