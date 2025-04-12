import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import * as config from '../config.js';
import exportStandalone from '../commands/export-standalone.js';

const { runtimeName } = config.project.runtime;

/**
 * Run a command and return a promise that resolves when the command completes
 * @param {string} command - The command to run
 * @param {object} options - Options for the command
 * @returns {Promise} - A promise that resolves when the command completes
 */
export function runCommand(command, options = {}) {
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

/**
 * Setup a standalone agent server
 * @param {object} options - Options for the server
 * @param {number} options.port - Port to run the server on
 * @param {string} options.tmpDir - Directory to store the standalone agent
 * @param {boolean} options.installDeps - Whether to install dependencies
 * @returns {Promise<object>} - A promise that resolves with server info
 */
export async function setupServer(options = {}) {
  const port = options.port || 8000;
  const tmpDir = path.join(config.project.tmpDir, 'standalone_agent');
  const venvPath = path.join(tmpDir, 'venv');

  if (runtimeName !== 'python' && runtimeName !== 'javascript') {
    throw new Error(`Server is not supported for ${runtimeName}.`);
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
    throw error;
  }

  return {
    port,
    tmpDir,
    venvPath,
    serverUrl: `http://localhost:${port}`
  };
}

/**
 * Start a server process
 * @param {object} options - Options for the server
 * @param {number} options.port - Port to run the server on
 * @param {string} options.tmpDir - Directory to store the standalone agent
 * @param {string} options.venvPath - Path to the virtual environment
 * @returns {Promise<object>} - A promise that resolves with server info
 */
export async function startServer(options) {
  const { port, tmpDir, venvPath, serverUrl } = options;
  const shutdownKey = uuidv4();
  
  console.log('Starting the standalone agent server...');
  
  let agentCommand;
  if (runtimeName === 'python') {
    const activateCommand = process.platform === 'win32' ?
      `${venvPath}\\Scripts\\activate.bat && ` :
      `source ${venvPath}/bin/activate && `;
    agentCommand = `${activateCommand}${config.project.runtime.command} src/main.py --http`;
  } else {
    agentCommand = `${config.project.runtime.command} src/index.js --http`;
  }

  const serverProcess = exec(agentCommand, { 
    env: {
      ...process.env,
      OPENAI_API_KEY: config.openai.apiKey,
      OPENAI_MODEL: config.openai.model,
      OPENAI_BASE_URL: config.openai.baseUrl,
      OPENAI_FREQUENCY_PENALTY: config.openai.frequencyPenalty,
      STRIP_CONSECUTIVE_USER_MSGS: config.openai.stripConsecutiveUserMsgs ? 'true' : 'false',
      OPENAI_TOP_P: config.openai.topP,
      PORT: port.toString(),
      SHUTDOWN_KEY: shutdownKey
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
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return {
    serverProcess,
    shutdownKey,
    serverUrl
  };
}

/**
 * Shutdown a server process
 * @param {object} options - Options for the server
 * @param {string} options.serverUrl - URL of the server
 * @param {string} options.shutdownKey - Key to use for shutdown
 * @param {object} options.serverProcess - The server process
 * @returns {Promise} - A promise that resolves when the server is shut down
 */
export async function shutdownServer(options) {
  const { serverUrl, shutdownKey, serverProcess } = options;
  
  console.log('Shutting down server...');
  try {
    await axios.post(`${serverUrl}/shutdown`, { key: shutdownKey });
  } catch (error) {
    console.error('Error stopping server:', error.message);
    if (serverProcess) serverProcess.kill();
  }
} 