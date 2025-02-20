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
import { getOutdatedItems } from './migrate-dry.js';
import { headersUpToDate } from './update-headers.js';
import { copyDir } from '../lib/file-utils.js';
import { getDeduplicatedImports } from '../controllers/code-gen.js';

const { runtimeName, codeFileExtension } = config.project.runtime;
const { codeDir, metadataDir, tasksDir } = config.project;

function getTaskFunctions() {
  // Get all task files
  const taskFiles = getAllFiles(codeDir, codeFileExtension);

  // Extract task functions from task files
  const tasks = {};
  const taskNameToFunctionNameMap = {};
  const taskToolSchemas = [];
  const taskToolCallDescriptionTemplates = {};

  taskFiles.forEach(file => {
    const code = fs.readFileSync(file.fullPath, 'utf8');
    const taskName = path.basename(file.fullPath, codeFileExtension);
    const doTaskCode = extractFunctionCode(code, 'doTask');
    if (doTaskCode) {
      // Convert task name to a valid function name for both Python and JavaScript
      const validFunctionName = taskName.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_');
      
      // Replace 'doTask' with the new function name for both Python and JavaScript
      const updatedCode = doTaskCode.replace(/\b(def|function)\s+doTask\b/, `$1 ${validFunctionName}`);
      
      tasks[validFunctionName] = updatedCode;
      taskNameToFunctionNameMap[taskName] = validFunctionName;

      // Get and update the task schema
      const metadataPath = path.join(metadataDir, `${taskName}.yml`);
      if (fs.existsSync(metadataPath)) {
        const metadata = yaml.load(fs.readFileSync(metadataPath, 'utf8'));
        if (metadata.output && metadata.output.task_schema) {
          let schemaString = metadata.output.task_schema;
          const taskNameRegex = new RegExp(taskName, 'g');
          schemaString = schemaString.replace(taskNameRegex, validFunctionName);
          schemaString = schemaString.replace(/\bdoTask\b/g, `TASKS.${validFunctionName}`);
          taskToolSchemas.push(schemaString);
        }
        if (metadata.output && metadata.output.tool_call_description_template) {
          taskToolCallDescriptionTemplates[validFunctionName] = metadata.output.tool_call_description_template;
        }
      }
    }
  });

  return { tasks, taskNameToFunctionNameMap, taskToolSchemas, taskToolCallDescriptionTemplates };
}

function getExamples() {
  const exampleNames = config.project.taskExamples;
  const examples = [];

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
      name,
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
    agentFile: 'src/main.py',
    constantsFile: 'src/constants.py',
    dependenciesFile: 'requirements.txt',
    installCommand: `${config.project.runtime.packageManager} install -r requirements.txt`,
    cliCommand: `${config.project.runtime.command} src/main.py`,
    httpCommand: `${config.project.runtime.command} src/main.py --http`,
  },
  javascript: {
    templateDir: 'javascript',
    agentFile: 'src/index.js',
    constantsFile: 'src/constants.js',
    dependenciesFile: 'package.json',
    installCommand: `${config.project.runtime.packageManager} install --include=dev`,
    cliCommand: `${config.project.runtime.command} src/index.js`,
    httpCommand: `${config.project.runtime.command} src/index.js --http`,
  }
};

function formatTaskFunctions(tasks) {
  if (runtimeName === 'python') {
    // handle indentation of the code
    return Object.entries(tasks).map(([name, code]) => 
      `    @staticmethod\n${code.split('\n').map(line => `    ${line}`).join('\n')}`
    ).join('\n');
  }

  return Object.entries(tasks).map(([name, code]) => `  ${name}: ${code}`).join(',\n');
}

function escapeInstructions(instructions) {
  if (runtimeName === 'javascript') {
    return instructions
      .replace(/\\/g, '\\\\')  // Escape backslashes
      .replace(/`/g, '\\`')   // Escape backticks
      .replace(/\$\{/g, '\\${'); // Escape template literal interpolation
  }
  // Python multiline string escaping
  return instructions
    .replace(/\\/g, '\\\\')     // Escape backslashes
    .replace(/"""/g, '\\"\\"\\"') // Escape triple double quotes
    .replace(/'''/g, "\\'\\'\\'"); // Escape triple single quotes
}

function injectAgentModules(outputDir, runtimeConfig) {
  const dependenciesPath = path.join(outputDir, runtimeConfig.dependenciesFile);
  const agentDependenciesPath = path.join(config.project.rootDir, runtimeConfig.dependenciesFile);
  
  if (runtimeName === 'python') {
    // Read agent's requirements
    const agentRequirements = fs.readFileSync(agentDependenciesPath, 'utf8')
      .split('\n')
      .filter(r => r.trim())
      .reduce((acc, req) => {
        const [name] = req.split('==');
        acc[name] = req;
        return acc;
      }, {});
    
    // Read current requirements
    let requirements = fs.readFileSync(dependenciesPath, 'utf8').split('\n').filter(r => r.trim());
    
    // Add project modules if not already present, using agent versions if available
    const moduleNames = (config.project.modules || []).map(module => module.name);
    
    for (const module of moduleNames) {
      if (!requirements.some(r => r.startsWith(module))) {
        // Use agent version if available, otherwise just add the module name
        requirements.push(agentRequirements[module] || module);
      }
    }
    
    // Write back updated requirements
    fs.writeFileSync(dependenciesPath, requirements.join('\n') + '\n');
  } else if (runtimeName === 'javascript') {
    // Read agent's package.json
    const agentPackageJson = JSON.parse(fs.readFileSync(agentDependenciesPath, 'utf8'));
    
    // Read current package.json
    const packageJson = JSON.parse(fs.readFileSync(dependenciesPath, 'utf8'));
    
    // Add project modules to dependencies if not already present
    const moduleNames = (config.project.modules || []).map(module => module.name);
    
    for (const module of moduleNames) {
      if (!packageJson.dependencies[module]) {
        // Use agent version if available, otherwise use latest
        packageJson.dependencies[module] = agentPackageJson.dependencies?.[module] || '*';
      }
    }
    
    // Write back updated package.json
    fs.writeFileSync(dependenciesPath, JSON.stringify(packageJson, null, 2) + '\n');
  }
}

export default async function exportStandalone(outputDir = process.cwd(), options = {}) {
  const { silent = false } = options;
  const log = silent ? () => {} : console.log;

  const { instructions, assistantInstructions, libs, functions, functionsHeader } = config.project;

  if (!runtimeConfigs[runtimeName]) {
    console.error(`Error: Standalone export is not supported for ${runtimeName}.`);
    process.exit(1);
  }

  if (outputDir !== process.cwd() && !fs.existsSync(outputDir)) {
    console.error(`Error: The specified output directory does not exist: ${outputDir}`);
    process.exit(1);
  }

  if (!functionsHeader) {
    console.error('Error: No functions header found in the project. Please run `faqtiv update-headers` before exporting.');
    process.exit(1);
  }

  const runtimeConfig = runtimeConfigs[runtimeName];
  const functionsCode = functions.map(f => f.code);
  const functionsNames = functions.map(f => f.name);
  const libsCode = libs.map(l => l.code);
  const libsNames = libs.map(f => f.name);
  const imports = getDeduplicatedImports(libs, functions);
  const { tasks, taskNameToFunctionNameMap, taskToolSchemas, taskToolCallDescriptionTemplates } = getTaskFunctions();
  const examples = getExamples();

  // Get the current file's path
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  // Read template files
  const templateDir = path.join(__dirname, `../export-templates/${runtimeConfig.templateDir}`);
  const constantsTemplate = fs.readFileSync(path.join(templateDir, runtimeConfig.constantsFile), 'utf8');
  const readmeTemplate = fs.readFileSync(path.join(__dirname, '../export-templates/README.md'), 'utf8');
  const gitignorePath = path.join(__dirname, '../export-templates/.gitignore');

  // Prepare data for templates
  const templateData = {
    imports: imports.join('\n'),
    libs: libsCode.join('\n'),
    libsNames: libsNames.length > 0 ? libsNames.join(',\n') + ',' : '',
    functions: functionsCode.join('\n'),
    functionNames: functionsNames.length > 0 ? functionsNames.join(',\n') + ',' : '',
    taskNameToFunctionNameMap: JSON.stringify(taskNameToFunctionNameMap, null, 2),
    tasks: formatTaskFunctions(tasks),
    taskToolSchemas: taskToolSchemas.join(',\n'),
    taskToolCallDescriptionTemplates: JSON.stringify(taskToolCallDescriptionTemplates, null, 2),
    generateAnsweringFunctionPrompt: escapeInstructions(generateAnsweringFunctionPrompt(instructions, functionsHeader.signatures, true)),
    getAssistantInstructionsPrompt: escapeInstructions(getAssistantInstructionsPrompt(assistantInstructions)),
    installCommand: runtimeConfig.installCommand,
    cliAgentCommand: runtimeConfig.cliCommand,
    httpServerCommand: runtimeConfig.httpCommand,
  };

  // Function to replace placeholders in templates
  function replacePlaceholders(template, data) {
    let result = template;
    for (const [key, value] of Object.entries(data)) {
      // Split the template at the placeholder and join with the value
      const placeholder = `{{ ${key} }}`;
      result = result.split(placeholder).join(value);
    }
    return result;
  }

  // Generate files from templates
  const constantsCode = replacePlaceholders(constantsTemplate, templateData);
  const readmeContent = replacePlaceholders(readmeTemplate, templateData);

  // Check if both src directory and package.json exist
  const targetSrcDir = path.join(outputDir, 'src');
  const targetPackageJsonPath = path.join(outputDir, runtimeConfig.dependenciesFile);
  const shouldDoPartialUpdate = fs.existsSync(targetSrcDir) && fs.existsSync(targetPackageJsonPath);

  if (!shouldDoPartialUpdate) {
    // If either src or package.json don't exist, do full export
    copyDir(templateDir, outputDir);
    fs.copyFileSync(gitignorePath, path.join(outputDir, '.gitignore'));
  } else {
    // If both exist, only update src and package.json
    const srcDir = path.join(templateDir, 'src');
    const packageJsonPath = path.join(templateDir, runtimeConfig.dependenciesFile);

    // Remove existing src directory
    fs.rmSync(targetSrcDir, { recursive: true, force: true });
    
    // Copy new src directory
    copyDir(srcDir, targetSrcDir);
    
    // Copy package.json
    fs.copyFileSync(packageJsonPath, targetPackageJsonPath);
  }

  // Write generated files
  fs.writeFileSync(path.join(outputDir, runtimeConfig.constantsFile), constantsCode);
  fs.writeFileSync(path.join(outputDir, 'README.md'), readmeContent);

  // Write examples
  const examplesDir = path.join(outputDir, 'src/examples');
  fs.mkdirSync(examplesDir, { recursive: true });
  examples.forEach(example => {
    fs.writeFileSync(
      path.join(examplesDir, `${example.name}.json`),
      JSON.stringify({
        taskEmbedding: example.taskEmbedding,
        functionsEmbedding: example.functionsEmbedding,
        document: example.document
      }, null, 2)
    );
  });

  // Copy data files
  const dataDir = path.join(config.project.dataFilesDir);
  if (!fs.existsSync(dataDir)) {
    console.warn(`WARNING: Data directory does not exist at path: ${dataDir}`);
    // Create empty data directory in output
    fs.mkdirSync(path.join(outputDir, 'src/data'), { recursive: true });
  } else {
    copyDir(dataDir, path.join(outputDir, 'src/data'));
  }

  // Inject the agent modules to the dependencies template
  injectAgentModules(outputDir, runtimeConfig);

  log(`Standalone agent exported to ${outputDir}`);
  if (!shouldDoPartialUpdate) {
    log('Performing full export. Generated files:');
    log(`- ${runtimeConfig.agentFile}`);
    log(`- ${runtimeConfig.constantsFile}`);
    log('- src/components/');
    log('- src/examples/');
    log('- src/data/');
    log(`- ${runtimeConfig.dependenciesFile}`);
    log('- README.md');
    log('- .gitignore');
  } else {
    log('Performing partial update. Updated files:');
    log('- src/ directory (replaced)');
    log(`- ${runtimeConfig.dependenciesFile} (replaced)`);
  }

  // Check headers up to date
  if (!headersUpToDate()) {
    console.warn('WARNING: Function headers are out of date, this could cause unexpected issues with the exported agent. It is recommended to run "faqtiv update-headers" before exporting.');
  }

  // Check for pending migrations
  const pendingMigrations = getOutdatedItems();
  if (pendingMigrations.length > 0) {
    console.warn('WARNING: There are pending task migrations, this could cause unexpected issues with the exported agent. It is recommended to run "faqtiv migrate-tasks" before exporting.');
  }
}