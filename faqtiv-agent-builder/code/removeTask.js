/**
* DEPENDENCIES
* Warning: these are extracted from your function files, if you need to make changes edit the function file and recompile this task.
 */

const { exec } = require('node:child_process')
const { existsSync } = require('node:fs')
const SwaggerParser = require('swagger-parser');
const fetch = require('node-fetch');
const yaml = require('js-yaml');
    
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

async function fetchYamlApiSpec(apiUrl) {
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch API spec: ${response.statusText}`);
    }
    const apiSpecText = await response.text();
    const apiSpec = yaml.load(apiSpecText)
    const parsedSpec = SwaggerParser.parse(apiSpec);
    return parsedSpec;
  } catch (error) {
    console.error(error);
    throw error;
  }
}
/**
* GENERATED CODE
* This function is the generated code: it's safe to edit.
 */

async function doTask(agentDirectoryPath, taskName) {
  const result = await executeAgentCommand(agentDirectoryPath, `remove-task ${taskName}`);
  console.log(JSON.stringify({ result }));
}