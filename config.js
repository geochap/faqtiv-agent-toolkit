import dotenv from 'dotenv';
import * as yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { decodeBase64 } from './lib/base64.js';
import { readFunctionFile } from './lib/parse-utils.js';

dotenv.config();

const codeExtensions = {
  'javascript': '.js',
  'python': '.py'
};
const runtimes = {
  'javascript': 'javascript',
  'python': 'python'
};
export const runtimeCommands = {
  'javascript': process.env.JS_CMD || 'node',
  'python': process.env.PYTHON_CMD || 'python'
};
export const runtimePackageManagers = {
  'javascript': process.env.JS_PKG_CMD || 'npm',
  'python': process.env.PYTHON_PKG_CMD || 'pip'
};
const defaultModules = {
  'javascript': [],
  'python': []
};

export let project = {};
export let openai = {};
export let logging = {};
export const version = '0.9.7';

export function loadConfig() {
  const projectWorkdir = path.join(process.cwd(), '.faqtiv');
  const isInProjectDir = fs.existsSync(projectWorkdir);
  const isInitCommand = process.argv.includes('init');
  const isHelpCommand = process.argv.includes('--help') || process.argv.length === 2;
  const isVersionCommand = process.argv.includes('--version');

  openai = {
    organization: process.env.OPENAI_ORGANIZATION,
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o',
    baseUrl: process.env.OPENAI_BASE_URL,
    frequencyPenalty: process.env.OPENAI_FREQUENCY_PENALTY,
    stripConsecutiveUserMsgs: process.env.STRIP_CONSECUTIVE_USER_MSGS == 'true',
    topP: process.env.OPENAI_TOP_P,
  };
  
  logging = {
    LOG_DEBUG_AI: process.env.LOG_DEBUG_AI == 'true'
  };

  if (isInitCommand || isHelpCommand || isVersionCommand) {
    project = {
      customInstructions: '',
      functionsHeader: {},
      functions: [],
      libs: [],
      runtime: {
        codeFileExtension: codeExtensions['javascript'],
        runtimeName: runtimes['javascript'],
        command: runtimeCommands['javascript'],
        packageManager: runtimePackageManagers['javascript']
      },
      modules: [],
      task_examples: [],
      auto_add_examples: true,
      metadataDir: path.join(projectWorkdir, 'code'),
      tasksDir: path.join(process.cwd(), 'tasks'),
      evalsDir: path.join(process.cwd(), 'evals'),
      codeDir: path.join(process.cwd(), 'code'),
      functionsDir: path.join(process.cwd(), 'functions'),
      headerPath: path.join(projectWorkdir, 'functions-header.yml'),
      tmpDir: path.join(projectWorkdir, 'tmp'),
      logsDir: path.join(process.cwd(), 'logs'),
      dataFilesDir: path.join(process.cwd(), 'data')
    };
  } else {
    if (!isInProjectDir) {
      console.error('Error: Not in a valid project directory.');
      process.exit(1);
    }
    if (!fs.existsSync(path.join('faqtiv_config.yml'))) {
      console.error('Error: Missing project configuration file faqtiv_config.yml');
      process.exit(1);
    }

    const faqtivConfig = yaml.load(fs.readFileSync(path.join('faqtiv_config.yml'), 'utf8'));
    const runtime = {
      codeFileExtension: codeExtensions[faqtivConfig.runtime],
      runtimeName: runtimes[faqtivConfig.runtime],
      defaultModules: defaultModules[faqtivConfig.runtime],
      command: runtimeCommands[faqtivConfig.runtime],
      packageManager: runtimePackageManagers[faqtivConfig.runtime]
    };

    const loadFunctions = (dir) => {
      const functionsDir = path.join(dir);
      let allFunctions = [];
  
      try {
        if (!fs.existsSync(functionsDir)) {
          console.error('Functions directory not found.');
          process.exit(1);
        }
  
        const functionFiles = fs.readdirSync(functionsDir).filter(file => file.endsWith(runtime.codeFileExtension));
        functionFiles.forEach(file => {
          const filePath = path.join(functionsDir, file);
          const code = fs.readFileSync(filePath, 'utf8');
          try {
            let { functions, imports } = readFunctionFile(code, runtime.runtimeName);

            functions = functions.map((f) => ({
              ...f,
              lastModified: fs.statSync(filePath).mtime,
              imports
            }));
            allFunctions = allFunctions.concat(functions);
          } catch (error) {
            console.error(`ERROR: failed to parse function file ${file}. This will dependent tasks to fail.`);
            console.error(error);
          }
        });
  
        return allFunctions;
      } catch (error) {
        console.error('Error loading function files:', error);
        process.exit(1);
      }
    };
    const functions = loadFunctions('functions');
    const libs = loadFunctions('libs');
    const modules = [...faqtivConfig.modules, ...defaultModules[faqtivConfig.runtime]];

    let functionsHeader;
    try {
      functionsHeader = yaml.load(fs.readFileSync(path.join('.faqtiv', 'functions-header.yml'), 'utf8'));
      functionsHeader.embedding = decodeBase64(functionsHeader.embedding);
    } catch(e) {}

    let instructions = '';
    try {
      instructions = fs.readFileSync(path.join('instructions.txt'), 'utf8');
    } catch(e) {}

    let assistantInstructions = '';
    try {
      assistantInstructions = fs.readFileSync(path.join('assistant_instructions.txt'), 'utf8');
    } catch(e) {}

    project = {
      instructions,
      assistantInstructions,
      functionsHeader,
      functions,
      libs,
      runtime,
      modules,
      taskExamples: faqtivConfig.task_examples || [],
      autoAddExamples: faqtivConfig.auto_add_examples != undefined ? faqtivConfig.auto_add_examples : false,
      rootDir: process.cwd(),
      metadataDir: path.join(projectWorkdir, 'code'),
      tasksDir: path.join(process.cwd(), 'tasks'),
      evalsDir: path.join(process.cwd(), 'evals'),
      codeDir: path.join(process.cwd(), 'code'),
      functionsDir: path.join(process.cwd(), 'functions'),
      libsDir: path.join(process.cwd(), 'libs'),
      headerPath: path.join(projectWorkdir, 'functions-header.yml'),
      tmpDir: path.join(projectWorkdir, 'tmp'),
      logsDir: path.join(process.cwd(), 'logs'),
      dataFilesDir: path.join(process.cwd(), 'data')
    };
  }
}

// Initial load
loadConfig();