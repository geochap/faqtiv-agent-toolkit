/**
 * Executes a git checkout command in the specified directory.
 *
 * @param {string} directoryPath - The path to the directory.
 * @param {string} branchName - The name of the branch to checkout.
 * @returns {Promise<string>} A promise that resolves with the command's stdout output.
 * @throws {Error} If there's an error executing the command.
 */
async function checkout(directoryPath, branchName) {
  const result = await executeCommand(directoryPath, ['git', 'checkout', '-b', branchName]);
  return result;
}