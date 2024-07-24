import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { execFile } from 'child_process';
import util from 'util';
import * as config from '../config.js';
import { initializeVectorStore } from '../lib/vector-store.js';
import { generateAdHocResponse } from '../controllers/code-gen.js';
import { headersUpToDate } from './update-headers.js';

const tmpdir = config.project.tmpDir;
const { runtimeName } = config.project.runtime;
const execFileAsync = util.promisify(execFile);

async function executeJS(tempFileName) {
  return execFileAsync('node', [tempFileName], { encoding: 'buffer' });
}

async function executePython(tempFileName) {
  const activateCommand = process.platform === 'win32' ? 
    `venv\\Scripts\\activate && python3 ${tempFileName}` : 
    `source venv/bin/activate && python3 ${tempFileName}`;

  return execFileAsync('bash', ['-c', activateCommand], { encoding: 'buffer' });
}

async function executeCode(code) {
  const executeCodeFns = {
    javascript: executeJS,
    python: executePython
  };
  const executeCodeFn = executeCodeFns[runtimeName];
  
  if (!executeCodeFn) {
    throw new Error(`Unknown runtime "${runtimeName}"`);
  }

  const tempFileName = path.join(tmpdir, `faqtiv-${uuidv4()}.js`);
  fs.writeFileSync(tempFileName, code);

  try {
    const { stdout, stderr } = await executeCodeFn(tempFileName);
    return { stdout, stderr };
  } finally {
    fs.unlinkSync(tempFileName);
  }
}

export default async function runAdHocTask(description) {
  const maxRetries = 3;
  let retryCount = 0;
  let errors = [];
  let previousCode = null;
  let response = null;

  while (retryCount <= maxRetries) {
    try {
      const headersUpdated = headersUpToDate();

      if (!headersUpdated) {
        console.warn('The functions header is outdated. Please run `faqtiv update-headers` to reflect recent changes in function files.');
        return;
      }
      if (!description) {
        console.warn('Please provide a description');
        return;
      }

      const vectorStore = await initializeVectorStore();
      response = await generateAdHocResponse(
        vectorStore,
        [
          {
            message: description,
            role: 'user'
          }
        ],
        retryCount,
        errors,
        previousCode
      );
    
      console.log(response.output.code);
      const { stdout, stderr } = await executeCode(response.output.code);
      
      if (stdout) {
        process.stdout.write(stdout);
      }
      if (stderr && stderr.length > 0) {
        process.stderr.write(stderr);
        throw new Error('Execution failed');
      }

      return;
    } catch (error) {
      console.error(`Error during execution (attempt ${retryCount + 1}):`, error);
      errors.push(error.message);
      retryCount++;

      if (retryCount > maxRetries) {
        console.error(`Max retries (${maxRetries}) reached. Aborting.`);
        throw error;
      }

      console.warn(`Retrying... (attempt ${retryCount} of ${maxRetries})`);
      if (response) {
        previousCode = response.output.code;
        response = null;
      }
    }
  }
}