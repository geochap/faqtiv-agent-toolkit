/**
 * Fixes a task in the faqtiv agent based on feedback.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @param {string} taskName - The name of the task to fix.
 * @param {string} feedback - The feedback to incorporate into the fix.
 * @returns {Promise<void>} A promise that resolves when the task is fixed.
 * @throws {Error} If there's an error executing the command.
 */
async function fixTask(agentDirectoryPath, taskName, feedback) {
  const escapedFeedback = escapeForShell(feedback);
  const args = ['fix-task', taskName, escapedFeedback];
  return await executeAgentCommand(agentDirectoryPath, args);
}
