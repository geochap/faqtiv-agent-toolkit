import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { initializeVectorStore } from '../lib/vector-store.js';
import { extractFunctionCode, extractFunctionNames } from '../lib/parse-utils.js';
import { generateResponse, generateTaskSchema } from '../controllers/code-gen.js';
import { headersUpToDate } from './update-headers.js';
import { getAllFiles } from '../lib/file-utils.js';
import migrateDry, { getOutdatedItems } from './migrate-dry.js';
import * as config from '../config.js';
import { getFunctionDependencies } from '../ai/code-agent.js';
import { encodeBase64 } from '../lib/base64.js';
import addExample from './add-example.js';

const metadataDir = config.project.metadataDir;
const tasksDir = config.project.tasksDir;
const codeDir = config.project.codeDir;
const codeFileExtension = config.project.runtime.codeFileExtension;

// any task files without a corresponding code file or if code is older
function findUnprocessedTasks(taskFiles, codeDir) {
  return taskFiles.filter(taskFile => {
    const taskStat = fs.statSync(taskFile.fullPath);
    const jsPath = path.join(codeDir, taskFile.relativePath.replace('.txt', codeFileExtension));

    if (!fs.existsSync(jsPath)) {
      return true;
    }
    
    const jsStat = fs.statSync(jsPath);
    if (jsStat.mtime < taskStat.mtime) {
      return true;
    }

    if (!fs.existsSync(metadataPath)) {
      return true;
    }
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

async function updateMetadata(taskName, codeFile) {
  const code = fs.readFileSync(codeFile.fullPath, 'utf8');
  const doTaskCode = extractFunctionCode(code, 'doTask');
  const metadataFilePath = path.join(metadataDir, codeFile.relativePath.replace(codeFileExtension, '.yml'));
  const metadata = yaml.load(fs.readFileSync(metadataFilePath, 'utf8'));

  const usedFunctions = extractFunctionNames(doTaskCode);
  const functionDependencies = getFunctionDependencies(usedFunctions, config.project.functions);
  const taskSchema = await generateTaskSchema(doTaskCode, taskName);

  metadata.output.functions = functionDependencies;
  metadata.output.task_schema = taskSchema;
  fs.writeFileSync(metadataFilePath, yaml.dump(metadata), 'utf8');
}

async function processTask(vectorStore, task) {
  const response = await generateResponse(
    task.name,
    vectorStore,
      [
      {
        message: task.content,
        role: 'user'
      }
    ]
  );

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
    console.error('No outdated tasks to migrate');
    process.exit(1);
  }

  const needToRecompile = migrationItems.filter(i => i.reasons.functionsAreNewerThanCode || i.reasons.libsAreNewerThanCode);
  const needToUpdateMetadata = migrationItems.filter(i => i.reasons.codeIsNewerThanMetadada);

  // Separate tasks that only need metadata update
  const onlyUpdateMetadata = needToUpdateMetadata.filter(item => !needToRecompile.some(r => r.taskName === item.taskName));

  // Update metadata for tasks that don't need recompilation
  for (let t of onlyUpdateMetadata) {
    console.log(`Updating metadata for ${t.taskName}...`);
    await updateMetadata(t.taskName, t.file);
    console.log('done');
  }
  if (onlyUpdateMetadata.length > 0) console.log(`Updated metadata for ${onlyUpdateMetadata.length} tasks`);

  if (needToRecompile.length > 0) {
    const vectorStore = await initializeVectorStore();
    for await (const item of needToRecompile) {
      const task = {
        name: path.basename(item.file.relativePath, codeFileExtension),
        relativePath: item.file.relativePath.replace(codeFileExtension, '.txt'),
        content: fs.readFileSync(path.join(tasksDir, item.file.relativePath.replace(codeFileExtension, '.txt')), 'utf8')
      };

      console.log(`Recompiling ${task.name}...`);
      const result = await processTask(vectorStore, task);
      writeResult(task, result, false);
      console.log('done');
    }
    console.log(`Recompiled ${needToRecompile.length} tasks`);
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
    console.error(`Task "${taskName}" doesn't exist`);
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
      console.error('The functions header is outdated. Please run `faqtiv update-headers` to reflect recent changes in function files.');
      process.exit(1);
    }
    const compileAll = options.all;

    if (!taskName && !compileAll) {
      console.error('Please provide a task name or use the --all option');
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
