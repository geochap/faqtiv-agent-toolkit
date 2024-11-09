const { spawn } = require('child_process');
const { existsSync } = require('node:fs');

/**
 * Executes a CLI command in the specified directory.
 *
 * @param {string} directoryPath - The path to the directory.
 * @param {string} command - The CLI command to execute, without the `faqtiv` prefix.
 * @param {string[]} args - An array of arguments to pass to the command.
 * @returns {Promise<string>} A promise that resolves with the command's stdout output.
 * @throws {Error} If there's an error executing the command.
 */
async function executeCommand(directoryPath, args) {
  return new Promise((resolve, reject) => {
    const isInitCommand = args[0] === 'init';
    let cwd = directoryPath;
    if (isInitCommand) {
      cwd = undefined;
    } else if (!directoryPath || !existsSync(directoryPath)) {
      return reject(new Error("Directory doesn't exist"));
    }
    

    const child = spawn(command, [...args], {
      cwd,
      shell: true, // Ensures command is executed within a shell
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed: ${stderr || 'Unknown error'}`));
      } else {
        if (stdout.length === 0 && stderr.length > 0) {
          resolve(stderr);
        } else {
          resolve(stdout);
        }
      }
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to start command: ${error.message}`));
    });
  });
}