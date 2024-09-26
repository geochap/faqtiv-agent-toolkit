/**
* DEPENDENCIES
* Warning: these are extracted from your function files, if you need to make changes edit the function file and recompile this task.
 */

const { spawn } = require('child_process');
const { existsSync } = require('node:fs');
const SwaggerParser = require('swagger-parser');
const fetch = require('node-fetch');
const yaml = require('js-yaml');
    
/**
* LIBRARY FUNCTIONS
* Warning: these are common functions, if you need to make changes edit the function file and recompile this task.
 */

function escapeForShell(text) {
  const isWindows = process.platform === 'win32';
  const normalizedText = text.replace(/\r\n/g, '\n');

  let escapedText;
  if (isWindows) {
    escapedText = normalizedText
      .replace(/"/g, '""')       // Double double quotes
      .replace(/`/g, '``')       // Double backticks
      .replace(/\$/g, '`$')      // Escape dollar sign with backtick
      .replace(/\\/g, '\\\\')    // Escape backslashes
      .replace(/\n/g, '`n');     // Newline in PowerShell
  } else {
    escapedText = normalizedText
      .replace(/\\/g, '\\\\')    // Escape backslashes first
      .replace(/"/g, '\\"')      // Then escape double quotes
      .replace(/`/g, '\\`')      // Then escape backticks
      .replace(/\$/g, '\\$')     // Then escape dollar signs
      .replace(/\n/g, '\\n');    // Then replace newlines
  }

  return `"${escapedText}"`;
}
/**
* PUBLIC FUNCTIONS
* Warning: these are common functions, if you need to make changes edit the function file and recompile this task.
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
  const args = ['compile-task', taskName];

  try {
    const result = await executeAgentCommand(agentDirectoryPath, args);
    console.log(JSON.stringify({ result }));
  } catch (error) {
    console.log(`Error executing task: ${error.stack}`);
  }
}