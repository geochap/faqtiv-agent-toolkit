// lib/runtime.js
import fs from 'fs';
import path from 'path';
import util from 'util';
import { v4 as uuidv4 } from 'uuid';
import * as config from '../config.js';
import { exec as rawExec } from 'child_process';

const exec = util.promisify(rawExec);

const tmpdir = config.project.tmpDir;
const { runtimeName, codeFileExtension, command } = config.project.runtime;

async function executeJS(tempFile) {
  const runCommand = `${command} ${tempFile}`;
  return exec(runCommand, {
    encoding: 'buffer',
    env: {
      ...process.env,
      DATA_FILES: path.resolve(config.project.dataFilesDir)
    }
  });
}

async function executePython(tempFile) {
  const activateCmd = process.platform === 'win32'
    ? `set DATA_FILES=${path.resolve(config.project.dataFilesDir)} && venv\\Scripts\\activate && ${command} ${tempFile}`
    : `export DATA_FILES=${path.resolve(config.project.dataFilesDir)} && source venv/bin/activate && ${command} ${tempFile}`;

  return exec(activateCmd, { encoding: 'buffer' });
}

export async function executeCode(code) {
  const fileName = path.join(tmpdir, `${uuidv4()}${codeFileExtension}`);
  fs.writeFileSync(fileName, code);

  const runFn = {
    javascript: executeJS,
    python: executePython
  }[runtimeName];

  if (!runFn) throw new Error(`Unsupported runtime: ${runtimeName}`);

  try {
    const { stdout, stderr } = await runFn(fileName);
    if (stderr?.length) throw new Error(stderr.toString());
    try {
      return JSON.parse(stdout.toString());
    } catch {
      return stdout.toString();
    }
  } finally {
    fs.unlinkSync(fileName);
  }
}
