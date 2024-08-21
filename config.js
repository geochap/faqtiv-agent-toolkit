import dotenv from 'dotenv';
import * as yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { decodeBase64 } from './lib/base64.js';
import { readFunctionFile } from './lib/parse-utils.js';

dotenv.config();

const projectWorkdir = path.join(process.cwd(), '.faqtiv');
const isInProjectDir = fs.existsSync(projectWorkdir);
const isInitCommand = process.argv.includes('init');
const isHelpCommand = process.argv.includes('--help') || process.argv.length === 2;
const isVersionCommand = process.argv.includes('--version');
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
const defaultModules = {
  'javascript': [],
  'python': []
};

let projectConfig = {};
let openaiConfig = {
  organization: process.env.OPENAI_ORGANIZATION,
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || 'gpt-4o'
};
let loggingConfig = {
  LOG_DEBUG_AI: process.env.LOG_DEBUG_AI == 'true'
};

if (isInitCommand || isHelpCommand || isVersionCommand) {
  projectConfig = {
    customInstructions: '',
    functionsHeader: {},
    functions: [],
    libs: [],
    runtime: {
      codeFileExtension: codeExtensions['javascript'],
      runtimeName: runtimes['javascript'],
      command: runtimeCommands['javascript']
    },
    modules: [],
    task_examples: [],
    auto_add_examples: true,
    metadataDir: path.join(projectWorkdir, 'code'),
    tasksDir: path.join(process.cwd(), 'tasks'),
    codeDir: path.join(process.cwd(), 'code'),
    functionsDir: path.join(process.cwd(), 'functions'),
    headerPath: path.join(projectWorkdir, 'functions-header.yml'),
    tmpDir: path.join(projectWorkdir, 'tmp'),
    logsDir: path.join(process.cwd(), 'logs')
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
    command: runtimeCommands[faqtivConfig.runtime]
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
        let { functions, imports } = readFunctionFile(code, runtime.runtimeName);

        functions = functions.map((f) => ({
          ...f,
          lastModified: fs.statSync(filePath).mtime,
          imports
        }));
        allFunctions = allFunctions.concat(functions);
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

  let desktopInstructions = '';
  try {
    desktopInstructions = fs.readFileSync(path.join('desktop_instructions.txt'), 'utf8');
  } catch(e) {}

  projectConfig = {
    instructions,
    desktopInstructions,
    functionsHeader,
    functions,
    libs,
    runtime,
    modules,
    taskExamples: faqtivConfig.task_examples || [],
    autoAddExamples: faqtivConfig.auto_add_examples != undefined ? faqtivConfig.auto_add_examples : false,
    metadataDir: path.join(projectWorkdir, 'code'),
    tasksDir: path.join(process.cwd(), 'tasks'),
    codeDir: path.join(process.cwd(), 'code'),
    functionsDir: path.join(process.cwd(), 'functions'),
    headerPath: path.join(projectWorkdir, 'functions-header.yml'),
    tmpDir: path.join(projectWorkdir, 'tmp'),
    logsDir: path.join(process.cwd(), 'logs')
  };
}

export const project = projectConfig;
export const openai = openaiConfig;
export const logging = loggingConfig;
export const version = '0.1.0';