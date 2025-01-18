import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import util from 'util';
import { mkdirpSync } from 'mkdirp';
import * as config from '../config.js';
import { initializeVectorStore } from '../lib/vector-store.js';
import { generateAdHocResponse } from '../controllers/code-gen.js';
import { headersUpToDate } from './update-headers.js';
import { unescapeText } from '../lib/shell-utils.js';

const tmpdir = config.project.tmpDir;
const logDir = path.join(config.project.logsDir, 'adhoc-tasks');
const { runtimeName, codeFileExtension } = config.project.runtime;
const execAsync = util.promisify(exec);

async function executeJS(tempFileName) {
  const runCommand = `${config.project.runtime.command} ${tempFileName}`;
  return execAsync(runCommand, { 
    encoding: 'buffer',
    env: {
      ...process.env,
      DATA_FILES: path.resolve(config.project.dataFilesDir)
    }
  });
}

async function executePython(tempFileName) {
  const activateCommand = process.platform === 'win32' ? 
    `set DATA_FILES=${path.resolve(config.project.dataFilesDir)} && venv\\Scripts\\activate && ${config.project.runtime.command} ${tempFileName}` : 
    `export DATA_FILES=${path.resolve(config.project.dataFilesDir)} && source venv/bin/activate && ${config.project.runtime.command} ${tempFileName}`;

  return execAsync(activateCommand, { encoding: 'buffer' });
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

  const tempFileName = path.join(tmpdir, `${uuidv4()}${codeFileExtension}`);
  fs.writeFileSync(tempFileName, code);

  try {
    const { stdout, stderr } = await executeCodeFn(tempFileName);
    return { stdout, stderr };
  } catch (error) {
    throw error;
  } finally {
    fs.unlinkSync(tempFileName);
  }
}

function createLogFile(description, code, result, error = null) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFileName = path.join(logDir, `${timestamp}${error ? '-error' : ''}.log`);
  
  mkdirpSync(path.dirname(logFileName));

  const delimiter = '\n\n---\n\n';

  let prettyResult;
  try {
    const parsedResult = JSON.parse(result);
    prettyResult = JSON.stringify(parsedResult, null, 2);
  } catch (e) {
    prettyResult = result;
  }

  const logContent = [
    `Description: \n\n ${description}`,
    delimiter,
    `Code: \n\n ${code}`,
    delimiter,
    `Result: \n\n ${prettyResult}`,
    error ? `${delimiter}Error: ${error.stack}` : ''
  ].join('');

  fs.writeFileSync(logFileName, logContent);
}

export default async function runAdHocTask(description) {
  const maxRetries = 5;
  let retryCount = 0;
  let errors = [];
  let previousCode = null;
  let response = null;

  while (retryCount < maxRetries) {
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

      // Unescape the description
      const unescapedDescription = unescapeText(description);

      const vectorStore = await initializeVectorStore();
      response = await generateAdHocResponse(
        vectorStore,
        [
          {
            message: unescapedDescription,
            role: 'user'
          }
        ],
        retryCount,
        errors,
        previousCode
      );

      if (!fs.existsSync(tmpdir)) mkdirpSync(tmpdir);
      if (!fs.existsSync(logDir)) mkdirpSync(logDir);
    
      const { stdout, stderr } = await executeCode(response.output.code);
      let result = stdout;
      
      if (stdout) {
        process.stdout.write(stdout.toString());
        try {
          result = JSON.parse(stdout.toString());
        } catch (e) {
          result = stdout.toString();
        }
      }
      if (stderr && stderr.length > 0) {
        process.stderr.write(stderr.toString());
        throw new Error('Execution failed');
      }

      createLogFile(description, response.output.code, stdout.toString());
      return result;
    } catch (error) {
      console.error(`Error during execution (attempt ${retryCount + 1}):`, error.message);
      errors.push(error.message);
      retryCount++;

      if (retryCount === maxRetries) {
        console.error(`Max retries (${maxRetries}) reached. Aborting.`);
        createLogFile(description, response ? response.output.code : 'N/A', 'N/A', error);
        process.exit(1);
      }

      console.warn(`Retrying... (attempt ${retryCount} of ${maxRetries})`);
      if (response) {
        previousCode = response.output.code;
        response = null;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}