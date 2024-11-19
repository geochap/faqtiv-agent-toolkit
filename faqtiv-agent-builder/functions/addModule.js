/**
 * Adds a new module to the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @param {string} moduleName - The name of the module to add.
 * @param {string} [alias] - Optional alias for the module.
 * @param {string} [version] - Optional version specification for the module.
 * @returns {Promise<void>} A promise that resolves when the module is added.
 * @throws {Error} If there's an error executing the command.
 */
async function addModule(agentDirectoryPath, moduleName, alias, version) {
  const args = ['add-module', moduleName];
  if (alias) args.push(alias);
  if (version) args.push(version);
  return await executeAgentCommand(agentDirectoryPath, args);
}
