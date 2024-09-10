import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import chokidar from 'chokidar';
import net from 'net';
import * as config from '../config.js';
import exportStandalone from './export-standalone.js';

const { runtimeName, codeFileExtension } = config.project.runtime;

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

  if (runtimeName !== 'python' && runtimeName !== 'javascript') {
    log(`Serve is not supported for ${runtimeName}.`);
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
    if (runtimeName === 'python') {
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
    } else if (runtimeName === 'javascript') {
      // Install dependencies for JavaScript
      const installCommand = `${config.project.runtime.packageManager} install`;
      
      await runCommand(installCommand, { 
        cwd: tmpDir,
        stdio: ['ignore', 'ignore', 'pipe'], // Suppress stdout, keep stderr
        shell: true
      });
    }
  } catch (error) {
    console.error('Failed to install dependencies:', error);
    process.exit(1);
  }

  let serverProcess;

  async function startServer() {
    console.log('Starting the standalone agent server...');
    const agentPath = path.join(tmpDir, `agent${codeFileExtension}`);
    
    let agentCommand;
    if (runtimeName === 'python') {
      const activateCommand = process.platform === 'win32' ?
        `${venvPath}\\Scripts\\activate.bat && ` :
        `source ${venvPath}/bin/activate && `;
      agentCommand = `${activateCommand}${config.project.runtime.command} ${agentPath} --http`;
    } else {
      agentCommand = `${config.project.runtime.command} ${agentPath} --http`;
    }

    serverProcess = exec(agentCommand, { 
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
      if (code) console.log(`Server process exited with code ${code}`);
    });

    console.log('Started FAQtiv standalone agent');
  }

  async function restartServer() {
    if (serverProcess) {
      console.log('Stopping the current server...');
      serverProcess.kill('SIGKILL');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('Re-exporting the agent...');
    await exportStandalone(tmpDir, { silent: true });

    await startServer();
  }

  // Setup live reload
  const watchPaths = [
    path.join(config.project.codeDir, `**/*${codeFileExtension}`),
    path.join(config.project.metadataDir, '**/*.yml')
  ];

  const watcher = chokidar.watch(watchPaths, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true
  });

  watcher.on('change', async (path) => {
    console.log(`File ${path} has been changed. Reloading...`);
    await restartServer();
  });

  // Initial server start
  await startServer();

  // Handle SIGINT (Ctrl+C) to gracefully shut down the server and watcher
  process.on('SIGINT', () => {
    console.log('Shutting down server and file watcher...');
    if (serverProcess) serverProcess.kill();
    watcher.close();
    process.exit();
  });
}