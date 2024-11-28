const { spawn } = require('child_process');
const { existsSync } = require('node:fs');

/**
 * Executes a faqtiv CLI command in the specified agent directory.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @param {string} command - The faqtiv CLI command to execute, without the `faqtiv` prefix.
 * @param {string[]} args - An array of arguments to pass to the command.
 * @returns {Promise<string>} A promise that resolves with the command's stdout output.
 * @throws {Error} If there's an error executing the command.
 */
async function executeAgentCommand(agentDirectoryPath, args) {
  return new Promise((resolve, reject) => {
    const isInitCommand = args[0] === 'init';
    let cwd = agentDirectoryPath;
    if (isInitCommand) {
      cwd = undefined;
    } else if (!agentDirectoryPath || !existsSync(agentDirectoryPath)) {
      return reject(new Error("Agent directory doesn't exist"));
    }
    

    const child = spawn('faqtiv', [...args], {
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
        reject(new Error(`faqtiv command failed: ${stderr || 'Unknown error'}`));
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