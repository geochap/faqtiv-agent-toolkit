import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { execFile } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { mkdirpSync } from 'mkdirp';
import * as config from '../config.js';
import { extractFunctionCode, getFunctionParameters } from '../lib/parse-utils.js';

const baseDir = process.cwd();
const tmpdir = path.resolve(baseDir, '.faqtiv', 'tmp');

const faqtivCodeMetadataDir = path.join('.faqtiv', 'code');
const tasksDir = path.join('tasks');
const codeDir = path.join('code');
const outputsDir = path.join('outputs');
const { codeFileExtension, runtimeName } = config.project.runtime;

function getParametrizedCode(code, parameters) {
  return `${code}\ndoTask('${parameters.join("', '")}');`;
}

function getRunnableCode(code, runParameters) {
  const doTaskCode = extractFunctionCode(code, 'doTask');
  const doTaskParameters = getFunctionParameters(doTaskCode);
  
  if (runParameters.length !== doTaskParameters.length) {
    console.error(`Expected ${doTaskParameters.length} arguments (${doTaskParameters.join(', ')}), but got ("${runParameters.join(', ')}")`);
    return;
  }

  return getParametrizedCode(code, runParameters);
}

function saveMetadata(metadataDir, metadata) {
  const metadataFilePath = path.join(metadataDir, 'metadata.yaml');
  const yamlContent = yaml.dump(metadata);
  fs.writeFileSync(metadataFilePath, yamlContent);
}

function executeJS(taskName, code, runParameters, outputFilePath, errorFilePath, metadataDir) {
  const tempFileName = path.join(tmpdir, `faqtiv-${uuidv4()}.js`);
  fs.writeFileSync(tempFileName, code);

  execFile(
    'node', [tempFileName], 
    { cwd: metadataDir, encoding: 'buffer' }, 
    getExecutionHandler(taskName, runParameters, tempFileName, outputFilePath, errorFilePath, metadataDir)
  );
}

function executePython(taskName, code, runParameters, outputFilePath, errorFilePath, metadataDir) {
  const tempFileName = path.join(tmpdir, `faqtiv-${uuidv4()}.py`);
  fs.writeFileSync(tempFileName, code);

  const activateCommand = process.platform === 'win32' ? 
    `venv\\Scripts\\activate && cd ${metadataDir} && python3 ${tempFileName}` : 
    `source venv/bin/activate && cd ${metadataDir} && python3 ${tempFileName}`;

  execFile(
    'bash', ['-c', activateCommand], 
    { encoding: 'buffer' }, 
    getExecutionHandler(taskName, runParameters, tempFileName, outputFilePath, errorFilePath, metadataDir)
  );
}

function getExecutionHandler(taskName, runParameters, tempFileName, outputFilePath, errorFilePath, metadataDir) {
  const startTime = new Date();

  return (error, stdout, stderr) => {
    const endTime = new Date();
    const runtime = (endTime - startTime) / 1000;

    const metadata = {
      run_at: startTime.toISOString(),
      task_name: taskName,
      task_parameters: runParameters,
      run_time: `${runtime} seconds`,
      output_file: outputFilePath || 'stdout',
      error_file: errorFilePath
    };

    if (stdout) {
      if (outputFilePath) {
        fs.writeFileSync(path.join(outputFilePath), stdout);
      } else {
        process.stdout.write(stdout);
      }
    }

    if (error || (stderr && stderr.length > 0)) {
      let errorDetails = `Execution error: ${error ? error.stack || error.message : ''}`;
      fs.appendFileSync(path.join(errorFilePath), errorDetails + "\n" + stderr);
    }

    fs.unlinkSync(tempFileName);

    saveMetadata(metadataDir, metadata);
  };
}

function executeCode(taskName, code, runParameters, outputFilePath, errorFilePath, metadataDir) {
  const executeCodeFns = {
    javascript: executeJS,
    python: executePython
  };
  const executeCodeFn = executeCodeFns[runtimeName];
  
  if (!executeCodeFn) {
    console.error(`Unknown runtime "${runtimeName}"`);
    process.exit(1);
  }
  executeCodeFn(taskName, code, runParameters, outputFilePath, errorFilePath, metadataDir);
}

export default function(taskName, ...args) {
  const runParameters = args[0];
  const options = args[1];

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFilePath = options.output || null;
  const defaultOutputDir = path.join(outputsDir, `${taskName}`, timestamp);
  const errorFilePath = options.error || `${defaultOutputDir}/err.log`;

  const taskFile = path.join(tasksDir, `${taskName}.txt`);
  if (!fs.existsSync(taskFile)) {
    console.error(`Task "${taskName}" doesn't exist`);
    process.exit(1);
  }

  const codeFilePath = path.join(codeDir, `${taskName}${codeFileExtension}`);
  const codeMetadataFilePath = path.join(faqtivCodeMetadataDir, `${taskName}.yml`);
  if (!fs.existsSync(codeFilePath) || !fs.existsSync(codeMetadataFilePath)) {
    console.error(`Task "${taskName}" code or metadata doesn't exist, please run faqtiv-compile ${taskName}`);
    process.exit(1);
  }

  const code = getRunnableCode(fs.readFileSync(codeFilePath, 'utf8'), runParameters);
  if (!code) {
    console.error('Failed to prepare code for execution');
    process.exit(1);
  }

  fs.mkdirSync(defaultOutputDir, { recursive: true });
  if (!fs.existsSync(tmpdir)) mkdirpSync(tmpdir);

  console.warn(`\nRun process initiated for ${taskName} (${runParameters.join(', ')})...\n`);
  if (outputFilePath) console.warn(`Result will be stored in ${outputFilePath}`);
  console.warn(`Error log will be stored in ${errorFilePath}`);
  console.warn(`Metadata will be stored in ${defaultOutputDir}/metadata.yaml`);

  executeCode(taskName, code, runParameters, outputFilePath, errorFilePath, defaultOutputDir);
}