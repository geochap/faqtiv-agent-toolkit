/**
 * Updates a task in the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @param {string} taskName - The name of the task to update.
 * @param {string} taskDescription - The new description for the task.
 * @returns {Promise<void>} A promise that resolves when the task is updated.
 * @throws {Error} If there's an error executing the command.
 */
async function updateTask(agentDirectoryPath, taskName, taskDescription) {
  const escapedDescription = escapeForShell(taskDescription);
  const args = ['update-task', taskName, escapedDescription];
  return await executeAgentCommand(agentDirectoryPath, args);
} 