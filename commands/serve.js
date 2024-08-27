import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import * as config from '../config.js';
import exportStandalone from './export-standalone.js';

function runCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const process = exec(command, options);
    
    process.stdout.on('data', (data) => console.log(data.toString()));
    process.stderr.on('data', (data) => console.error(data.toString()));
    
    process.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed with exit code ${code}`));
    });
  });
}

export default async function serve(options) {
  const port = options.port || 8000;
  const tmpDir = path.join(config.project.tmpDir, 'standalone_agent');
  const venvPath = path.join(tmpDir, 'venv');

  if (config.project.runtime.name !== 'python') {
    console.log('Serve is only supported for Python.');
    return;
  }

  // Ensure the tmp directory exists
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  console.log('Creating agent...');
  await exportStandalone(tmpDir, { silent: true });

  console.log('Installing dependencies...');
  try {
    // Create virtual environment
    await runCommand(`${config.project.runtime.command} -m venv venv`, { cwd: tmpDir, stdio: 'ignore' });
    
    // Install dependencies
    const activateCommand = process.platform === 'win32' ?
      `${venvPath}\\Scripts\\activate.bat && ` :
      `source ${venvPath}/bin/activate && `;

    const installCommand = `${activateCommand}${config.project.runtime.packageManager} install -r requirements.txt`;
    
    await runCommand(installCommand, { 
      cwd: tmpDir,
      stdio: ['ignore', 'ignore', 'pipe'], // Suppress stdout, keep stderr
      shell: true
    });
  } catch (error) {
    console.error('Failed to install dependencies:', error);
    process.exit(1);
  }

  console.log('Starting the standalone agent server...');
  const agentPath = path.join(tmpDir, 'agent.py');
  
  const activateCommand = process.platform === 'win32' ?
    `${venvPath}\\Scripts\\activate.bat && ` :
    `source ${venvPath}/bin/activate && `;

  const agentCommand = `${activateCommand}${config.project.runtime.command} ${agentPath} --http`;

  const serverProcess = exec(agentCommand, { 
    env: {
      ...process.env,
      OPENAI_API_KEY: config.openai.apiKey,
      OPENAI_MODEL: config.openai.model,
      PORT: port.toString()
    },
    cwd: tmpDir,
    shell: true
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(data.toString());
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(data.toString());
  });

  serverProcess.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
  });

  console.log(`Server running on port ${port}`);

  // Handle SIGINT (Ctrl+C) to gracefully shut down the server
  process.on('SIGINT', () => {
    console.log('Shutting down server...');
    serverProcess.kill();
    process.exit();
  });
}