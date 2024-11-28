/**
 * Shows the details of a specific task in the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @param {string} taskName - The name of the task to show.
 * @returns {Promise<string>} A promise that resolves with the task details.
 * @throws {Error} If there's an error executing the command.
 */
async function showTask(agentDirectoryPath, taskName) {
  const args = ['show-task', taskName];
  return await executeAgentCommand(agentDirectoryPath, args);
} 