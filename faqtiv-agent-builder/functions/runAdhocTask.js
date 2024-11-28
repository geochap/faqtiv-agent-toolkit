/**
 * Runs an ad-hoc task in the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @param {string} description - The description of the ad-hoc task to run.
 * @returns {Promise<void>} A promise that resolves when the task completes.
 * @throws {Error} If there's an error executing the command.
 */
async function runAdhocTask(agentDirectoryPath, description) {
  const escapedDescription = escapeForShell(description);
  const args = ['run-ad-hoc-task', escapedDescription];

  return await executeAgentCommand(agentDirectoryPath, args);
} 