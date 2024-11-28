/**
* DEPENDENCIES
* Warning: these are extracted from your function files, if you need to make changes edit the function file and recompile this task.
 */

const { spawn } = require('child_process');
const { existsSync } = require('node:fs');
    
/**
* LIBRARY FUNCTIONS
* Warning: these are common functions, if you need to make changes edit the function file and recompile this task.
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
      shell: true,
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
/**
* PUBLIC FUNCTIONS
* Warning: these are common functions, if you need to make changes edit the function file and recompile this task.
 */

async function checkout(directoryPath, branchName) {
  const result = await executeCommand(directoryPath, ['git', 'checkout', '-b', branchName]);
  return result;
}
/**
* GENERATED CODE
* This function is the generated code: it's safe to edit.
 */

async function doTask(directoryPath, branchName) {
    const result = await checkout(directoryPath, branchName);
    console.log(JSON.stringify({ result }));
}