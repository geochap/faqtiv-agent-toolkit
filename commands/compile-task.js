import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import VectorStore from '../lib/vector-store.js';
import { extractFunctionCode, extractFunctionNames } from '../lib/parse-utils.js';
import { generateResponse } from '../controllers/code-gen.js';
import { headersUpToDate } from './update-headers.js';
import { getAllFiles } from '../lib/file-utils.js';
import migrateDry, { getOutdatedItems } from './migrate-dry.js';
import * as config from '../config.js';
import { getFunctionDependencies } from '../ai/steps.js';
import { decodeBase64, encodeBase64 } from '../lib/base64.js';
import addExample from './add-example.js';

const metadataDir = path.join('.faqtiv', 'code');
const tasksDir = path.join('tasks');
const codeDir = path.join('code');
const codeFileExtension = config.project.runtime.codeFileExtension;

async function initializeVectorStore( omitTaskNames = [] ) {
  const examples = config.project.taskExamples;
  const vectorStore = new VectorStore();

  console.log('Initializing vector store...');
  const vectors = [];

  for (const name of examples) {
    if (omitTaskNames.includes(name)) continue;

    const ymlFilePath = path.join(metadataDir, `${name}.yml`);
    const txtFilePath = path.join(tasksDir, `${name}.txt`);
    const jsFilePath = path.join(codeDir, `${name}${codeFileExtension}`);

    if (!fs.existsSync(ymlFilePath)) {
      throw new Error(`Example task "${name}" metadata is missing, please run: faqtiv compile-task ${name}`);
    }
    if (!fs.existsSync(txtFilePath)) {
      throw new Error(`Example task "${name}" description is missing`);
    }
    if (!fs.existsSync(jsFilePath)) {
      throw new Error(`Example task "${name}" code is missing, please run: faqtiv compile-task ${name}`);
    }

    const yamlContent = yaml.load(fs.readFileSync(ymlFilePath, 'utf8'));
    const taskText = fs.readFileSync(txtFilePath, 'utf8');
    const jsFileContent = fs.readFileSync(jsFilePath, 'utf8');
    const doTaskCodeString = extractFunctionCode(jsFileContent, 'doTask');

    vectors.push({
      taskEmbedding: decodeBase64(yamlContent.embedding),
      functionsEmbedding: decodeBase64(yamlContent.functions_embedding),
      document: {
        id: yamlContent.id,
        task: taskText,
        code: doTaskCodeString
      }
    });
  }

  if (vectors.length > 0) {
    await vectorStore.addTaskVectors(vectors.map((v) => ({ embedding: v.taskEmbedding, ...v.document })));
    await vectorStore.addFunctionsHeaderVector(vectors.map((v) => ({ embedding: v.functionsEmbedding, ...v.document })));
  }

  console.log(`${vectors.length} examples loaded into the vector store...`);
  console.log('Vector store initialized successfully');

  return vectorStore;
}

// any task files without a corresponding code file or if code is older
function findUnprocessedTasks(taskFiles, codeDir) {
  return taskFiles.filter(taskFile => {
    const taskStat = fs.statSync(taskFile.fullPath);
    const jsPath = path.join(codeDir, taskFile.relativePath.replace('.txt', codeFileExtension));
    const jsStat = fs.statSync(jsPath);
    return !fs.existsSync(jsPath) || jsStat.mtime < taskStat.mtime;
  });
}

function getUnprocessedTasks() {
  const taskFiles = getAllFiles(tasksDir, '.txt');
  const missingCodeFiles = findUnprocessedTasks(taskFiles, codeDir);

  return missingCodeFiles.map(item => {
    return {
      name: path.basename(item.fullPath, '.txt'),
      relativePath: item.relativePath,
      content: fs.readFileSync(item.fullPath, 'utf8')
    }
  });
}

function getTask(name) {
  const filePath = path.join(tasksDir, `${name}.txt`);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return {
    name: path.basename(filePath, '.txt'),
    relativePath: path.relative(tasksDir, filePath),
    content: fs.readFileSync(filePath, 'utf8')
  };
}

// Delete orphan .yml files with no corresponding code file or task file to leave out of the vector store
function cleanUpOrphans() {
  const faqtivFiles = getAllFiles(metadataDir, '.yml');

  faqtivFiles.forEach(file => {
    const baseName = file.relativePath.replace('.yml', '');
    const jsFilePath = path.join(codeDir, `${baseName}${codeFileExtension}`);
    const taskFilePath = path.join(tasksDir, `${baseName}.txt`);

    if (!fs.existsSync(taskFilePath)) {
      if (fs.existsSync(jsFilePath)) {
        fs.unlinkSync(jsFilePath);
      }
      fs.unlinkSync(file.fullPath);
    } else if (!fs.existsSync(jsFilePath)) {
      fs.unlinkSync(file.fullPath);
    }
  });
}

function updateMetadata(codeFile) {
  const code = fs.readFileSync(codeFile.fullPath, 'utf8');
  const doTaskCode = extractFunctionCode(code, 'doTask');
  const metadataFilePath = path.join(metadataDir, codeFile.relativePath.replace(codeFileExtension, '.yml'));
  const metadata = yaml.load(fs.readFileSync(metadataFilePath, 'utf8'));

  const usedFunctions = extractFunctionNames(doTaskCode);
  const functionDependencies = getFunctionDependencies(null, usedFunctions, config.project.functions);

  metadata.output.functions = functionDependencies;
  fs.writeFileSync(metadataFilePath, yaml.dump(metadata), 'utf8');
}

async function processTask(vectorStore, task) {
  const response = await generateResponse(vectorStore, [
    {
      message: task.content,
      role: 'user'
    }
  ]);

  return response;
}

function writeResult(task, result, addAsExample) {
  const metadataPath = path.join('.faqtiv', 'code', task.relativePath.replace('.txt', '.yml'));
  const codePath = path.join('code', task.relativePath.replace('.txt', codeFileExtension));

  // Ensure directories exist
  fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
  fs.mkdirSync(path.dirname(codePath), { recursive: true });

  const code = result.output.code;
  result.output.code = undefined; // exclude code from metadata
  result.embedding = encodeBase64(result.embedding);
  result.functions_embedding = encodeBase64(result.functions_embedding);

  // Write code content
  fs.writeFileSync(codePath, code, 'utf8');
  console.log(`Wrote task code: ${codePath}`);

  // Write YAML content
  fs.writeFileSync(metadataPath, yaml.dump(result), 'utf8');
  console.log(`Wrote metadata file: ${metadataPath}`);

  // Add as example
  if (addAsExample) {
    console.log(`Added ${task.name} as example`);
    addExample(task.name, { supressLogs: true });
  }
}

export async function migrateTask(options) {
  if (options.dry) {
    return migrateDry();
  }

  const migrationItems = getOutdatedItems();

  if (migrationItems.length == 0) {
    console.log('No outdated tasks to migrate');
    process.exit(1);
  }

  const needToRecompile = migrationItems.filter(i => i.reasons.functionsAreNewerThanCode || i.reasons.libsAreNewerThanCode);
  const needToUpdateMetadata = migrationItems.filter(i => i.reasons.codeIsNewerThanMetadada);

  // First update metadata as these could include examples used for compilation
  for (let t of needToUpdateMetadata) {
    updateMetadata(t.file);
  }
  if (needToUpdateMetadata.length > 0) console.log(`Updated metadata for ${needToUpdateMetadata.length} tasks`);

  if (needToRecompile.length > 0) {
    const vectorStore = await initializeVectorStore();
    for await (const item of needToRecompile) {
      const task = {
        name: path.basename(item.file.relativePath, codeFileExtension),
        relativePath: item.file.relativePath.replace(codeFileExtension, '.txt'),
        content: fs.readFileSync(path.join(tasksDir, item.file.relativePath.replace(codeFileExtension, '.txt')), 'utf8')
      };

      console.log(`Migrating ${task.name}...`);
      const result = await processTask(vectorStore, task);
      writeResult(task, result, false);
    }
  }
}

async function compileAllUnprocessed() {
  const unprocessedTasks = getUnprocessedTasks();

  if (unprocessedTasks.length == 0) {
    console.log('No unprocessed tasks found.');
    return;
  }

  console.log(`Found ${unprocessedTasks.length} unprocessed task files.`);
  unprocessedTasks.forEach(task => console.log(`Task: ${task.name}, Content length: ${task.content.length} characters`));

  const vectorStore = await initializeVectorStore();
  for await (let i of unprocessedTasks) {
    console.log(`Processing task ${i.name}...`);
    
    const result = await processTask(vectorStore, i);
    writeResult(i, result, config.project.autoAddExamples);
  }
}

async function compileTask(taskName) {
  const task = getTask(taskName);
  
  if (!task) {
    console.log(`Task "${taskName}" doesn't exist`);
    process.exit(1);
  }

  const vectorStore = await initializeVectorStore([taskName]);

  console.log(`Processing task ${taskName}...`);

  const result = await processTask(vectorStore, task);
  writeResult(task, result, config.project.autoAddExamples);
}

export default async function(taskName, options) {
  try {
    const headersUpdated = headersUpToDate();

    if (!headersUpdated) {
      console.log('The functions header is outdated. Please run `faqtiv update-headers` to reflect recent changes in function files.');
      process.exit(1);
    }
    const compileAll = options.all;

    if (!taskName && !compileAll) {
      console.log('Please provide a task name or use the --all option');
      process.exit(1);
    }

    cleanUpOrphans();
    
    if (compileAll) compileAllUnprocessed()
    else compileTask(taskName)
  } catch (error) {
    console.error('Error during compilation:', error);
    process.exit(1);
  }
}
