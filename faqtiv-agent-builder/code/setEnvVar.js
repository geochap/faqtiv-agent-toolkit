/**
* DEPENDENCIES
* Warning: these are extracted from your function files, if you need to make changes edit the function file and recompile this task.
 */

const { exec } = require('node:child_process')
const { existsSync } = require('node:fs')
    
/**
* PUBLIC FUNCTIONS
* Warning: these are common functions, if you need to make changes edit the function file and recompile this task.
 */

async function executeAgentCommand(agentDirectoryPath, command) {
  return new Promise((resolve, reject) => {
    exec(`faqtiv ${command}`, { cwd: existsSync(agentDirectoryPath)?agentDirectoryPath:undefined, shell:true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`faqtiv command failed: ${stderr || error.message}`))
      } else {
        if (stdout.length === 0 && stderr.length > 0) {
          resolve(stderr)
        } else {
          resolve(stdout)
        }
      }
    })
  })
}
/**
* GENERATED CODE
* This function is the generated code: it's safe to edit.
 */

async function doTask(agentDirectoryPath, key, value) {
  const result = await executeAgentCommand(agentDirectoryPath, `set-env-var "${key}" "${value}"`);
  console.log(JSON.stringify({ result }));
}