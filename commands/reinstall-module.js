import * as config from '../config.js';
import { exec } from 'child_process';

const runtimeName = config.project.runtime.runtimeName;

async function updateJS() {
  return new Promise((resolve, reject) => {
    exec(`${config.project.runtime.packageManager} install`, (error, stdout, stderr) => {
      if (error) {
        console.error(`npm install failed: ${error.message}`);
        return reject(error);
      }
      console.log(`${config.project.runtime.packageManager} install completed successfully`);
      resolve();
    });
  });
}

async function updatePython() {
  return new Promise((resolve, reject) => {
    // Activate virtual environment and run pip install
    const activateCommand = process.platform === 'win32' ? 
    `venv\\Scripts\\activate && ${config.project.runtime.packageManager} install -r requirements.txt` : 
    `source venv/bin/activate && ${config.project.runtime.packageManager} install -r requirements.txt`;

    // Run pip install for the module
    exec(activateCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error installing modules: ${error.message}`);
        return reject(false);
      }

      console.log(`${config.project.runtime.packageManager} install completed successfully`);
      resolve(true);
    });
  });
}

export default async function updateInterpreter() {
  const updateFns = {
    javascript: updateJS,
    python: updatePython
  };
  const updateFn = updateFns[runtimeName];
  
  if (!updateFn) {
    console.log(`Skipping module install for runtime ${runtimeName}`);
    process.exit(0);
  }
  try {
    await updateFn();
  } catch(e) {
    console.error('Failed to install modules:', e.message);
    process.exit(1);
  }
}
