/**
* DEPENDENCIES
* Warning: these are extracted from your function files, if you need to make changes edit the function file and recompile this task.
 */

const { exec } = require('node:child_process')
    
/**
* PUBLIC FUNCTIONS
* Warning: these are common functions, if you need to make changes edit the function file and recompile this task.
 */

async function executeAgentCommand(agentDirectoryPath, command) {
  return new Promise((resolve, reject) => {
    exec(`faqtiv ${command}`, { cwd: agentDirectoryPath }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Error executing command: ${stderr || error.message}`))
      } else {
        resolve(stdout)
      }
    })
  })
}
/**
* GENERATED CODE
* This function is the generated code: it's safe to edit.
 */

async function doTask(agentDirectoryPath, moduleName, alias, version) {
  let command = `add-module ${moduleName}`;
  if (alias) {
    command += ` ${alias}`;
  }
  if (version) {
    command += ` ${version}`;
  }
  const result = await executeAgentCommand(agentDirectoryPath, command);
  console.log(JSON.stringify(result));
}