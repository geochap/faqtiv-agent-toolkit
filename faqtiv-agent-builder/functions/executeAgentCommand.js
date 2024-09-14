const { exec } = require('node:child_process')
const { existsSync } = require('node:fs')

/**
 * Executes a faqtiv cli command in the specified agent directory.
 *
 * @param {string} agentDirectoryPath - The path to the faqtiv agent directory.
 * @param {string} command - The faqtiv cli command to execute, don't include the `faqtiv` prefix. For example, to add a module, use `add-module <name> [alias] [version]`.
 * @returns {Promise<string>} A promise that resolves with the command's stdout output.
 * @throws {Error} If there's an error executing the command.
 */
async function executeAgentCommand(agentDirectoryPath, command) {
  return new Promise((resolve, reject) => {
    exec(`faqtiv ${command}`, { cwd: existsSync(agentDirectoryPath)?agentDirectoryPath:undefined, shell:true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`faqtiv command failed: ${stderr || error.message}`))
      } else {
        resolve(stdout)
      }
    })
  })
}