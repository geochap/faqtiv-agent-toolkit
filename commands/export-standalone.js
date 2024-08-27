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
      // Convert task name to a valid Python function name
      const validPythonName = taskName.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_');
      taskFunctions.push(doTaskCode.replace('def doTask', `def ${validPythonName}`));
      taskNameMap[taskName] = validPythonName;

      // Get and update the task schema
      const metadataPath = path.join(metadataDir, `${taskName}.yml`);
      if (fs.existsSync(metadataPath)) {
        const metadata = yaml.load(fs.readFileSync(metadataPath, 'utf8'));
        if (metadata.output && metadata.output.task_schema) {
          let schemaString = metadata.output.task_schema;
          const taskNameRegex = new RegExp(taskName, 'g');
          schemaString = schemaString.replace(taskNameRegex, validPythonName);
          schemaString = schemaString.replace(/doTask/g, validPythonName);
          taskToolSchemas.push(schemaString);
        }
      }
    }
  });

  return { taskFunctions, taskNameMap, taskToolSchemas };
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

export default async function exportStandalone(outputDir = process.cwd(), options = {}) {
  const { silent = false } = options;
  const log = silent ? () => {} : console.log;

  const { instructions, assistantInstructions, libs, functions, functionsHeader, modules } = config.project;

  if (runtimeName !== 'python') {
    log('Standalone export is only supported for Python.');
    return;
  }

  const adhocToolSchemas = functionsHeader.function_tool_schemas;
  const functionsCode = functions.map(f => f.code);
  const libsCode = libs.map(l => l.code);
  const imports = [...new Set(libs.concat(functions).flatMap(f => f.imports))];
  const { taskFunctions, taskNameMap, taskToolSchemas } = getTaskFunctions();
  const examples = getExamples();

  // Get the current file's path
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Read template files
  const agentTemplate = fs.readFileSync(path.join(__dirname, '../export-templates/python/agent.py'), 'utf8');
  const readmeTemplate = fs.readFileSync(path.join(__dirname, '../export-templates/README.md'), 'utf8');
  const requirementsTemplate = fs.readFileSync(path.join(__dirname, '../export-templates/python/requirements.txt'), 'utf8');

  // Prepare data for templates
  const templateData = {
    imports: imports.join('\n'),
    libs: libsCode.join('\n'),
    functions: functionsCode.join('\n'),
    taskNameMap: JSON.stringify(taskNameMap, null, 2),
    tasks: taskFunctions.join('\n\n'),
    taskToolSchemas: taskToolSchemas.join(',\n'),
    adhocToolSchemas: JSON.stringify(adhocToolSchemas, null, 2),
    examples: JSON.stringify(examples, null, 2),
    generateAnsweringFunctionPrompt: generateAnsweringFunctionPrompt(instructions, functionsHeader.signatures, true),
    getAssistantInstructionsPrompt: getAssistantInstructionsPrompt(assistantInstructions, instructions),
    installCommand: `${config.project.runtime.packageManager} install -r requirements.txt`,
    cliAgentCommand: `${config.project.runtime.command} agent.py`,
    httpServerCommand: `${config.project.runtime.command} agent.py --http`,
    agentDependencies: modules.map(m => m.name).join('\n')
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
  const requirementsContent = replacePlaceholders(requirementsTemplate, templateData);

  // Write files
  fs.writeFileSync(path.join(outputDir, 'agent.py'), agentCode);
  fs.writeFileSync(path.join(outputDir, 'README.md'), readmeContent);
  fs.writeFileSync(path.join(outputDir, 'requirements.txt'), requirementsContent);

  log(`Standalone agent exported to ${outputDir}`);
  log('Generated files:');
  log('- agent.py');
  log('- requirements.txt');
  log('- README.md');
}