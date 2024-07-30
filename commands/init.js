import fs from 'fs';
import { execSync } from 'child_process';
import { mkdirp } from 'mkdirp';
import path from 'path';
import * as config from '../config.js';

const { runtimeName: defaultRuntime } = config.project.runtime; // defaults to javascript
const defaultInstructions = ``;
const defaultDesktopInstructions = ``;
const runtimes = ['javascript', 'python'];

const defaultEnvFile = `OPENAI_ORGANIZATION=<your_org>
OPENAI_API_KEY=<your_api_key>
OPENAI_MODEL=<openai_model>
LOG_DEBUG_AI=false
`;
const gitIgnore = `
outputs/*
.faqtiv/tmp/*
.env
`;
const runtimeGitIgnore = {
  javascript: 'node_modules/',
  python: 'venv/'
};

export function initJS(baseDir) {
  // Create package.json for npm project
  execSync('npm init -y', { cwd: baseDir, stdio: 'ignore' });
    
  // Install base npm packages
  // execSync('npm install <package_name>', { cwd: baseDir, stdio: 'ignore' });
}

export function initPython(baseDir) {
  // Create a requirements.txt file
  fs.writeFileSync(`${baseDir}/requirements.txt`, '');
          
  // Setup virtual environment
  execSync(`${config.project.runtime.command} -m venv venv`, { cwd: baseDir, stdio: 'ignore' });
}

export default async function(projectRoot, options) {
  // Base directory path based on the given project root
  const baseDir = path.resolve(process.cwd(), projectRoot);

  // Check if the directory already exists
  if (fs.existsSync(baseDir)) {
    console.error(`Error: The directory '${projectRoot}' already exists.`);
    return;
  }

  const projectRuntime = options.runtime || defaultRuntime;

  if (!runtimes.includes(projectRuntime)) {
    console.error(`Unknown runtime "${projectRuntime}", valid runtimes are: ${runtimes.join(', ')}`);
    return;
  }

  // Directory paths
  const directories = [
    `${baseDir}/.faqtiv/code`,
    `${baseDir}/.faqtiv/tmp`,
    `${baseDir}/tasks`,
    `${baseDir}/code`,
    `${baseDir}/outputs`,
    `${baseDir}/functions`,
    `${baseDir}/libs`
  ];

  const faqtivConfig = `runtime: ${projectRuntime}
auto_add_examples: true
modules: []
task_examples: []`;

  try {
    // Create all directories
    for (const dir of directories) {
      await mkdirp(dir);
    }

    // Create files
    fs.writeFileSync(`${baseDir}/faqtiv_config.yml`, faqtivConfig);
    fs.writeFileSync(`${baseDir}/.env.example`, defaultEnvFile);
    fs.writeFileSync(`${baseDir}/instructions.txt`, defaultInstructions);
    fs.writeFileSync(`${baseDir}/desktop_instructions.txt`, defaultDesktopInstructions);
    fs.writeFileSync(`${baseDir}/.gitignore`, `${gitIgnore}\n${runtimeGitIgnore[projectRuntime]}`);

    // Initialize interpreter environment
    const initFns = {
      javascript: initJS,
      python: initPython
    };
    const initFn = initFns[projectRuntime];
    
    if (!initFn) {
      console.log(`Skipping interpreter environment setup for runtime ${projectRuntime}`);
      process.exit(0);
    }
    initFn(baseDir);

    console.log('Project successfully created in:', projectRoot);
  } catch (error) {
    console.error('Failed to create the project structure:', error.message);
    try {
      await fs.promises.rm(baseDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error(`Cleanup failed: Unable to remove '${baseDir}'.`, cleanupError);
      process.exit(1);
    }
  }
};