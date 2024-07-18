import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { execFile } from 'child_process';
import * as config from '../config.js';
import { initializeVectorStore } from '../lib/vector-store.js';
import { generateResponse } from '../controllers/code-gen.js';
import { headersUpToDate } from './update-headers.js';

const tmpdir = config.project.tmpDir;
const { runtimeName } = config.project.runtime;

function executeJS(tempFileName) {
  execFile(
    'node', [tempFileName], 
    { encoding: 'buffer' }, 
    getExecutionHandler(tempFileName)
  );
}

function executePython(tempFileName) {
  const activateCommand = process.platform === 'win32' ? 
    `venv\\Scripts\\activate && python3 ${tempFileName}` : 
    `source venv/bin/activate && python3 ${tempFileName}`;

  execFile(
    'bash', ['-c', activateCommand], 
    { encoding: 'buffer' }, 
    getExecutionHandler(tempFileName)
  );
}

function getExecutionHandler(tempFileName) {
  return (error, stdout, stderr) => {
    fs.unlinkSync(tempFileName);
    if (stdout) {
      process.stdout.write(stdout);
      process.exit(0);
    }
    if (error || (stderr && stderr.length > 0)) {
      process.stderr.write(stderr.length > 0 ? stderr : error);
      process.exit(1);
    }
  };
}

function executeCode(code) {
  const executeCodeFns = {
    javascript: executeJS,
    python: executePython
  };
  const executeCodeFn = executeCodeFns[runtimeName];
  
  if (!executeCodeFn) {
    console.error(`Unknown runtime "${runtimeName}"`);
    process.exit(1);
  }

  const tempFileName = path.join(tmpdir, `faqtiv-${uuidv4()}.js`);
  fs.writeFileSync(tempFileName, code);

  executeCodeFn(tempFileName);
}

export default async function runAdHocTask(description) {

  try {
    const headersUpdated = headersUpToDate();

    if (!headersUpdated) {
      console.log('The functions header is outdated. Please run `faqtiv update-headers` to reflect recent changes in function files.');
      process.exit(1);
    }
    if (!description) {
      console.log('Please provide a description');
      process.exit(1);
    }

    const vectorStore = await initializeVectorStore();
    const response = await generateResponse(
      'adhoc',
      vectorStore,
        [
        {
          message: description,
          role: 'user'
        }
      ],
      true
    );
  
    executeCode(response.output.code);
  } catch (error) {
    console.error('Error during compilation:', error);
    process.exit(1);
  }
}