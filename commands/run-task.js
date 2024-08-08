import fs from 'fs';
import path from 'path';
import { execFile, exec } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { mkdirpSync } from 'mkdirp';
import * as config from '../config.js';
import { extractFunctionCode, getFunctionParameters } from '../lib/parse-utils.js';
import { log, logErr } from '../lib/log4j.js';

const tmpdir = config.project.tmpDir;
const faqtivCodeMetadataDir = config.project.metadataDir;
const tasksDir = config.project.tasksDir;
const codeDir = config.project.codeDir;
const { codeFileExtension, runtimeName } = config.project.runtime;

function getParametrizedCode(code, parameters) {
  return `${code}\ndoTask(${parameters.length > 0 ? "'" + parameters.join("', '") + "'" : ''});`;
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

function executeJS(taskName, code, runParameters, outputFilePath, errorFilePath, execOptions) {
  const tempFileName = path.join(tmpdir, `${uuidv4()}.js`);
  fs.writeFileSync(tempFileName, code);

  execFile(
    config.project.runtime.command, [tempFileName], 
    execOptions, 
    getExecutionHandler(taskName, runParameters, tempFileName, outputFilePath, errorFilePath)
  );
}

function executePython(taskName, code, runParameters, outputFilePath, errorFilePath, execOptions) {
  const tempFileName = path.join(tmpdir, `${uuidv4()}.py`);
  fs.writeFileSync(tempFileName, code);
  const activateCommand = process.platform === 'win32' ?
    `venv\\Scripts\\activate && cd ${execOptions.cwd} && ${config.project.runtime.command} ${tempFileName}` :
    `source venv/bin/activate && cd ${execOptions.cwd} && ${config.project.runtime.command} ${tempFileName}`;

  exec(
    activateCommand,
    getExecutionHandler(taskName, runParameters, tempFileName, outputFilePath, errorFilePath)
  );
}

function getExecutionHandler(taskName, runParameters, tempFileName, outputFilePath, errorFilePath) {
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
      error_file: errorFilePath || 'stderr'
    };

    if (stdout) {
      if (outputFilePath) {
        fs.writeFileSync(path.join(outputFilePath), stdout);
      } else {
        process.stdout.write(stdout);
      }
    }

    if (error || (stderr && stderr.length > 0)) {
      const errorDetails = `Execution error: ${error ? error.stack || error.message : ''}`;
      const errorMessage = errorDetails + "\n" + stderr;

      if (errorFilePath) {
        fs.writeFileSync(path.join(errorFilePath), errorMessage);
      } else {
        logErr('run-task', taskName, { task_name: taskName, task_parameters: runParameters }, error);
        process.stderr.write(errorMessage);
      }
    } else {
      log('run-task', taskName, metadata);
    }

    fs.unlinkSync(tempFileName);
  };
}

function executeCode(taskName, code, runParameters, outputFilePath, errorFilePath, execOptions) {
  const executeCodeFns = {
    javascript: executeJS,
    python: executePython
  };
  const executeCodeFn = executeCodeFns[runtimeName];
  
  if (!executeCodeFn) {
    console.error(`Unknown runtime "${runtimeName}"`);
    process.exit(1);
  }
  executeCodeFn(taskName, code, runParameters, outputFilePath, errorFilePath, execOptions);
}

export default function(taskName, ...args) {
  const runParameters = args[0];
  const options = args[1];
  const outputFilePath = options.output || null;
  const errorFilePath = options.error || null;
  const filesOutputDir = options.files ? path.resolve(options.files) : null;

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

  if (!fs.existsSync(tmpdir)) mkdirpSync(tmpdir);
  if (filesOutputDir && !fs.existsSync(filesOutputDir)) mkdirpSync(filesOutputDir);

  const execOptions = {
    cwd: filesOutputDir || process.cwd(),
    encoding: 'buffer'
  };

  console.warn(`\nRun process initiated for ${taskName} (${runParameters.join(', ')})...\n`);
  if (outputFilePath) console.warn(`Result will be stored in ${outputFilePath}`);
  if (errorFilePath) console.warn(`Error log will be stored in ${errorFilePath}`);
  if (filesOutputDir) console.warn(`Working directory changed to ${filesOutputDir}`);

  executeCode(taskName, code, runParameters, outputFilePath, errorFilePath, execOptions);
}