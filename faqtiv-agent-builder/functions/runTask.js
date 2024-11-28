/**
 * Runs a task in the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @param {string} taskName - The name of the task to run.
 * @param {string} [packedArgs=''] - Comma-separated arguments to pass to the task.
 * @returns {Promise<string>} A promise that resolves when the task completes.
 * @throws {Error} If there's an error executing the command.
 */
async function runTask(agentDirectoryPath, taskName, packedArgs = '') {
  const argsArray = packedArgs ? packedArgs.split(',').map(arg => escapeForShell(arg)) : [];
  const args = ['run-task', taskName, ...argsArray];
  return await executeAgentCommand(agentDirectoryPath, args);
} 