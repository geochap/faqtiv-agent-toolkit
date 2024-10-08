import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { initializeVectorStore } from '../lib/vector-store.js';
import { extractFunctionCode, extractFunctionNames } from '../lib/parse-utils.js';
import { generateResponse, generateTaskSchema } from '../controllers/code-gen.js';
import { headersUpToDate } from './update-headers.js';
import * as config from '../config.js';
import { getFunctionDependencies } from '../ai/code-agent.js';
import { encodeBase64 } from '../lib/base64.js';
import { unescapeText } from '../lib/shell-utils.js';

const tasksDir = config.project.tasksDir;
const codeDir = config.project.codeDir;
const metadataDir = config.project.metadataDir;
const codeFileExtension = config.project.runtime.codeFileExtension;

async function fixTask(taskName, feedback) {
  try {
    // Unescape the feedback
    const unescapedFeedback = unescapeText(feedback);

    const headersUpdated = headersUpToDate();

    if (!headersUpdated) {
      console.error('The functions header is outdated. Please run `faqtiv update-headers` to reflect recent changes in function files.');
      process.exit(1);
    }

    const taskFilePath = path.join(tasksDir, `${taskName}.txt`);
    const codeFilePath = path.join(codeDir, `${taskName}${codeFileExtension}`);
    const metadataFilePath = path.join(metadataDir, `${taskName}.yml`);

    if (!fs.existsSync(taskFilePath) || !fs.existsSync(codeFilePath) || !fs.existsSync(metadataFilePath)) {
      console.error(`Task "${taskName}" doesn't exist or is not compiled.`);
      process.exit(1);
    }

    const taskContent = fs.readFileSync(taskFilePath, 'utf8');
    const codeContent = fs.readFileSync(codeFilePath, 'utf8');
    const doTaskCode = extractFunctionCode(codeContent, 'doTask');

    const vectorStore = await initializeVectorStore();
    const result = await generateResponse(
      taskName,
      vectorStore,
      [
        { message: taskContent, role: 'user' },
        { message: `Current implementation:\n\n${doTaskCode}`, role: 'assistant' },
        { message: `Fix the task based on this feedback: ${unescapedFeedback}`, role: 'user' }
      ]
    );

    const newCode = result.output.code;
    const newDoTaskCode = extractFunctionCode(newCode, 'doTask');

    // Update task file
    const updatedTaskContent = `${taskContent}\n\nFeedback: ${unescapedFeedback}`;
    fs.writeFileSync(taskFilePath, updatedTaskContent, 'utf8');

    // Update code file
    const updatedCodeContent = codeContent.replace(doTaskCode, newDoTaskCode);
    fs.writeFileSync(codeFilePath, updatedCodeContent, 'utf8');

    // Update metadata
    const metadata = yaml.load(fs.readFileSync(metadataFilePath, 'utf8'));
    const usedFunctions = extractFunctionNames(newDoTaskCode);
    const functionDependencies = getFunctionDependencies(usedFunctions, config.project.functions);
    const taskSchema = await generateTaskSchema(newDoTaskCode, taskName);

    metadata.output.functions = functionDependencies;
    metadata.output.task_schema = taskSchema;
    metadata.embedding = encodeBase64(result.embedding);
    metadata.functions_embedding = encodeBase64(result.functions_embedding);

    fs.writeFileSync(metadataFilePath, yaml.dump(metadata), 'utf8');

    console.log(`Task "${taskName}" has been updated successfully.`);
  } catch (error) {
    console.error('Error during task fix:', error);
    process.exit(1);
  }
}

export default fixTask;