/**
 * Sets an environment variable for the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @param {string} key - The name of the environment variable.
 * @param {string} value - The value to set for the environment variable.
 * @returns {Promise<void>} A promise that resolves when the variable is set.
 * @throws {Error} If there's an error executing the command.
 */
async function setEnvVar(agentDirectoryPath, key, value) {
  const escapedValue = escapeForShell(value);
  const args = ['set-env-var', key, escapedValue];
  return await executeAgentCommand(agentDirectoryPath, args);
} 