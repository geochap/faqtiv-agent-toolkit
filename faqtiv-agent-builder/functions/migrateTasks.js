/**
 * Migrates tasks in the faqtiv agent.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @param {boolean} [dry=false] - Whether to perform a dry run.
 * @returns {Promise<string>} A promise that resolves when tasks are migrated.
 * @throws {Error} If there's an error executing the command.
 */
async function migrateTasks(agentDirectoryPath, dry = false) {
  const args = ['migrate-tasks'];
  if (dry) {
    args.push('--dry');
  }
  return await executeAgentCommand(agentDirectoryPath, args);
} 