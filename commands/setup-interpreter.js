import { exec } from 'child_process';
import * as config from '../config.js';

const { runtimeName } = config.project.runtime;

export function setupJS(baseDir) {
  exec(`npm install`, { cwd: baseDir, stdio: 'inherit' });
}

export function setupPython(baseDir) {
  exec(`${config.project.runtime.command} -m venv venv`, { cwd: baseDir, stdio: 'inherit' });
  
  const activateCommand = process.platform === 'win32' ? 
    `venv\\Scripts\\activate && pip install -r requirements.txt` : 
    `source venv/bin/activate && pip install -r requirements.txt`;

  exec(activateCommand, { cwd: baseDir, stdio: 'inherit' });
}

export default async function() {
  if (runtimeName === 'javascript') {
    setupJS(process.cwd());
  } else if (runtimeName === 'python') {
    setupPython(process.cwd());
  }
}