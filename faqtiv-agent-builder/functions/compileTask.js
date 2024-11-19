/**
 * Compiles a task in the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @param {string} taskName - The name of the task to compile.
 * @returns {Promise<void>} A promise that resolves when the task is compiled.
 * @throws {Error} If there's an error executing the command.
 */
async function compileTask(agentDirectoryPath, taskName) {
  const args = ['compile-task', taskName];
  return await executeAgentCommand(agentDirectoryPath, args);
}
