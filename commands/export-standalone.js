import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { generateAnsweringFunctionPrompt } from '../ai/prompts/generate-answering-function.js';
import { getAssistantInstructionsPrompt } from '../ai/prompts/assistant-instructions.js';
import * as config from '../config.js';
import { getAllFiles } from '../lib/file-utils.js';
import { extractFunctionCode } from '../lib/parse-utils.js';

const { runtimeName, codeFileExtension } = config.project.runtime;
const { codeDir, metadataDir, tasksDir } = config.project;

const exportDependencies = {
  python: [
    'faiss-cpu==1.8.0.post1',
    'fastapi==0.112.0',
    'langchain==0.2.12',
    'langchain-community==0.2.11',
    'langchain-core==0.2.28',
    'langchain-openai==0.1.20',
    'langchain-text-splitters==0.2.2',
    'numpy==1.26.4',
    'openai==1.38.0',
    'pydantic==2.8.2',
    'pydantic_core==2.20.1',
    'requests==2.32.3',
    'uvicorn==0.30.5'
  ],
  javascript: {
    "@langchain/core": "^0.2.31",
    "@langchain/openai": "^0.2.8",
    "body-parser": "^1.20.2",
    "exceljs": "^4.4.0",
    "express": "^4.19.2",
    "langchain": "^0.2.17",
    "zod": "^3.23.8",
    "uuid": "^10.0.0"
  }
};

function getTaskFunctions() {
  // Get all task files
  const taskFiles = getAllFiles(codeDir, codeFileExtension);

  // Extract task functions from task files
  const taskFunctions = [];
  const taskNameMap = {};
  const taskToolSchemas = [];

  taskFiles.forEach(file => {
    const code = fs.readFileSync(file.fullPath, 'utf8');
    const taskName = path.basename(file.fullPath, codeFileExtension);
    const doTaskCode = extractFunctionCode(code, 'doTask');
    if (doTaskCode) {
      // Convert task name to a valid function name for both Python and JavaScript
      const validFunctionName = taskName.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_');
      
      // Replace 'doTask' with the new function name for both Python and JavaScript
      const updatedCode = doTaskCode.replace(/\b(def|function)\s+doTask\b/, `$1 ${validFunctionName}`);
      
      taskFunctions.push(updatedCode);
      taskNameMap[taskName] = validFunctionName;

      // Get and update the task schema
      const metadataPath = path.join(metadataDir, `${taskName}.yml`);
      if (fs.existsSync(metadataPath)) {
        const metadata = yaml.load(fs.readFileSync(metadataPath, 'utf8'));
        if (metadata.output && metadata.output.task_schema) {
          let schemaString = metadata.output.task_schema;
          const taskNameRegex = new RegExp(taskName, 'g');
          schemaString = schemaString.replace(taskNameRegex, validFunctionName);
          schemaString = schemaString.replace(/\bdoTask\b/g, validFunctionName);
          taskToolSchemas.push(schemaString);
        }
      }
    }
  });

  return { taskFunctions, taskNameMap, taskToolSchemas, taskFunctionNames: Object.values(taskNameMap).join(', ') };
}

function getExamples() {
  const examples = [];
  const exampleNames = config.project.taskExamples;

  for (const name of exampleNames) {
    const ymlFilePath = path.join(metadataDir, `${name}.yml`);
    const txtFilePath = path.join(tasksDir, `${name}.txt`);
    const jsFilePath = path.join(codeDir, `${name}${codeFileExtension}`);

    if (!fs.existsSync(ymlFilePath) || !fs.existsSync(txtFilePath) || !fs.existsSync(jsFilePath)) {
      console.warn(`Skipping example "${name}" due to missing files.`);
      continue;
    }

    const yamlContent = yaml.load(fs.readFileSync(ymlFilePath, 'utf8'));
    const taskText = fs.readFileSync(txtFilePath, 'utf8');
    const jsFileContent = fs.readFileSync(jsFilePath, 'utf8');
    const doTaskCodeString = extractFunctionCode(jsFileContent, 'doTask');

    examples.push({
      taskEmbedding: yamlContent.embedding,
      functionsEmbedding: yamlContent.functions_embedding,
      document: {
        id: yamlContent.id,
        task: taskText,
        code: doTaskCodeString
      }
    });
  }

  return examples;
}

const runtimeConfigs = {
  python: {
    templateDir: 'python',
    agentFile: 'agent.py',
    dependenciesFile: 'requirements.txt',
    installCommand: `${config.project.runtime.packageManager} install -r requirements.txt`,
    cliCommand: `${config.project.runtime.command} agent.py`,
    httpCommand: `${config.project.runtime.command} agent.py --http`,
  },
  javascript: {
    templateDir: 'javascript',
    agentFile: 'agent.js',
    dependenciesFile: 'package.json',
    installCommand: `${config.project.runtime.packageManager} install`,
    cliCommand: `${config.project.runtime.command} agent.js`,
    httpCommand: `${config.project.runtime.command} agent.js --http`,
  }
};

function getDependenciesFile(runtimeName, existingDependencies) {
  let updatedDependencies = existingDependencies;
  if (runtimeName === 'python') {
    // For Python, append new dependencies to requirements.txt
    updatedDependencies += '\n' + exportDependencies[runtimeName].join('\n');
  } else if (runtimeName === 'javascript') {
    // For JavaScript, update package.json
    const packageJson = JSON.parse(existingDependencies || '{}');
    packageJson.dependencies = { ...packageJson.dependencies, ...exportDependencies[runtimeName] };
    updatedDependencies = JSON.stringify(packageJson, null, 2);
  }
  return updatedDependencies;
}

export default async function exportStandalone(outputDir = process.cwd(), options = {}) {
  const { silent = false } = options;
  const log = silent ? () => {} : console.error;

  const { instructions, assistantInstructions, libs, functions, functionsHeader } = config.project;

  if (!runtimeConfigs[runtimeName]) {
    log(`Standalone export is not supported for ${runtimeName}.`);
    return;
  }

  const runtimeConfig = runtimeConfigs[runtimeName];
  const functionsCode = functions.map(f => f.code);
  const functionsName = functions.map(f => f.name);
  const libsCode = libs.map(l => l.code);
  const imports = [...new Set(libs.concat(functions).flatMap(f => f.imports))];
  const { taskFunctions, taskNameMap, taskToolSchemas, taskFunctionNames } = getTaskFunctions();
  const examples = getExamples();

  // Get the current file's path
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Read template files
  const agentTemplate = fs.readFileSync(path.join(__dirname, `../export-templates/${runtimeConfig.templateDir}/${runtimeConfig.agentFile}`), 'utf8');
  const readmeTemplate = fs.readFileSync(path.join(__dirname, '../export-templates/README.md'), 'utf8');

  // Read existing dependencies file
  let existingDependencies = '';
  const existingDependenciesPath = path.join(process.cwd(), runtimeConfig.dependenciesFile);
  if (fs.existsSync(existingDependenciesPath)) {
    existingDependencies = fs.readFileSync(existingDependenciesPath, 'utf8');
  }

  // Add export dependencies to existing agent dependencies file
  const dependencies = getDependenciesFile(runtimeName, existingDependencies);

  // Prepare data for templates
  const templateData = {
    imports: imports.join('\n'),
    libs: libsCode.join('\n'),
    functions: functionsCode.join('\n'),
    functionNames: functionsName.join(',\n'),
    taskNameMap: JSON.stringify(taskNameMap, null, 2),
    tasks: taskFunctions.join('\n\n'),
    taskToolSchemas: taskToolSchemas.join(',\n'),
    examples: JSON.stringify(examples, null, 2),
    generateAnsweringFunctionPrompt: generateAnsweringFunctionPrompt(instructions, functionsHeader.signatures, true),
    getAssistantInstructionsPrompt: getAssistantInstructionsPrompt(assistantInstructions, instructions),
    installCommand: runtimeConfig.installCommand,
    cliAgentCommand: runtimeConfig.cliCommand,
    httpServerCommand: runtimeConfig.httpCommand,
    taskFunctionNames
  };

  // Function to replace placeholders in templates
  function replacePlaceholders(template, data) {
    return Object.entries(data).reduce((acc, [key, value]) => {
      return acc.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), value);
    }, template);
  }

  // Generate files from templates
  const agentCode = replacePlaceholders(agentTemplate, templateData);
  const readmeContent = replacePlaceholders(readmeTemplate, templateData);

  // Write files
  fs.writeFileSync(path.join(outputDir, runtimeConfig.agentFile), agentCode);
  fs.writeFileSync(path.join(outputDir, 'README.md'), readmeContent);
  fs.writeFileSync(path.join(outputDir, runtimeConfig.dependenciesFile), dependencies);

  log(`Standalone agent exported to ${outputDir}`);
  log('Generated files:');
  log(`- ${runtimeConfig.agentFile}`);
  log(`- ${runtimeConfig.dependenciesFile}`);
  log('- README.md');
}