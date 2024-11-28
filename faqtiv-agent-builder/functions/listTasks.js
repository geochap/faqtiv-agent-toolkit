/**
 * Lists all tasks in the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @returns {Promise<string>} A promise that resolves with the list of tasks.
 * @throws {Error} If there's an error executing the command.
 */
async function listTasks(agentDirectoryPath) {
  const args = ['list-tasks'];
  return await executeAgentCommand(agentDirectoryPath, args);
} 