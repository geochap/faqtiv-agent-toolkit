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

function escapeForShell(text) {
  const isWindows = process.platform === 'win32';
  const normalizedText = text.replace(/\r\n/g, '\n');

  let escapedText;
  if (isWindows) {
    escapedText = normalizedText
      .replace(/"/g, '""')       // Double double quotes
      .replace(/`/g, '``')       // Double backticks
      .replace(/\$/g, '`$')      // Escape dollar sign with backtick
      .replace(/\n/g, '`n')      // Newline in PowerShell
      .replace(/\\/g, '\\\\');   // Escape backslashes
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

async function addDocument(agentDirectoryPath, name, content) {
  const escapedContent = escapeForShell(content);
  const args = ['add-document', name, escapedContent];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function addFunction(agentDirectoryPath, functionName, functionCode) {
  const escapedFunctionCode = escapeForShell(functionCode);
  const args = ['add-function', functionName, escapedFunctionCode];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function addModule(agentDirectoryPath, moduleName, alias, version) {
  const args = ['add-module', moduleName];
  if (alias) args.push(alias);
  if (version) args.push(version);
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function addTask(agentDirectoryPath, taskName, description) {
  const escapedDescription = escapeForShell(description);
  const args = ['add-task', taskName, escapedDescription];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function compileTask(agentDirectoryPath, taskName) {
  const args = ['compile-task', taskName];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function fixTask(agentDirectoryPath, taskName, feedback) {
  const escapedFeedback = escapeForShell(feedback);
  const args = ['fix-task', taskName, escapedFeedback];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function getInstructions(agentDirectoryPath) {
  const args = ['show-instructions'];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function initializeAgent(agentDirectoryPath, runtime = 'javascript') {
  const args = ['init', agentDirectoryPath, '--runtime', runtime];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function listDocuments(agentDirectoryPath) {
  const args = ['list-documents', '--json'];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function listFunctions(agentDirectoryPath) {
  const args = ['list-functions', '--json'];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function listTasks(agentDirectoryPath) {
  const args = ['list-tasks'];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function migrateTasks(agentDirectoryPath, dry = false) {
  const args = ['migrate-tasks'];
  if (dry) {
    args.push('--dry');
  }
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function parseYamlApiSpec(apiUrl) {
  return await fetchYamlApiSpec(apiUrl);
}

async function removeFunction(agentDirectoryPath, functionName) {
  const args = ['remove-function', functionName];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function removeTask(agentDirectoryPath, taskName) {
  const args = ['remove-task', taskName];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function runAdhocTask(agentDirectoryPath, description) {
  const escapedDescription = escapeForShell(description);
  const args = ['run-ad-hoc-task', escapedDescription];

  return await executeAgentCommand(agentDirectoryPath, args);
}

async function runTask(agentDirectoryPath, taskName, packedArgs = '') {
  const argsArray = packedArgs ? packedArgs.split(',').map(arg => escapeForShell(arg)) : [];
  const args = ['run-task', taskName, ...argsArray];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function setEnvVar(agentDirectoryPath, key, value) {
  const escapedValue = escapeForShell(value);
  const args = ['set-env-var', key, escapedValue];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function showDocument(agentDirectoryPath, documentName) {
  const args = ['show-document', documentName];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function showInstructions(agentDirectoryPath) {
  const args = ['show-instructions'];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function showProjectConfig(agentDirectoryPath) {
  const args = ['show-config', '--json'];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function showTask(agentDirectoryPath, taskName) {
  const args = ['show-task', taskName];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function updateDocHeaders(agentDirectoryPath) {
  const args = ['update-doc-headers'];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function updateFunction(agentDirectoryPath, functionName, newCode) {
  const escapedCode = escapeForShell(newCode);
  const args = ['update-function', functionName, escapedCode];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function updateHeaders(agentDirectoryPath) {
  const args = ['update-headers'];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function updateInstructions(agentDirectoryPath, newInstructions) {
  const escapedInstructions = escapeForShell(newInstructions);
  const args = ['update-instructions', escapedInstructions];
  return await executeAgentCommand(agentDirectoryPath, args);
}

async function updateTask(agentDirectoryPath, taskName, taskDescription) {
  const escapedDescription = escapeForShell(taskDescription);
  const args = ['update-task', taskName, escapedDescription];
  return await executeAgentCommand(agentDirectoryPath, args);
}
/**
* GENERATED CODE
* This function is the generated code: it's safe to edit.
 */

async function doTask(agentDirectoryPath, moduleName, alias = undefined, version = undefined) {
  await addModule(agentDirectoryPath, moduleName, alias, version);
  console.log(JSON.stringify({ result: `Module "${moduleName}" added successfully.` }));
}