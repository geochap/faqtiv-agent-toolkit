import dotenv from 'dotenv';
import * as yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import { decodeBase64 } from './lib/base64.js';
import { readFunctionFile } from './lib/parse-utils.js';

dotenv.config();

const projectWorkdir = path.join('.faqtiv');
const isInProjectDir = fs.existsSync(projectWorkdir);
const isInitCommand = process.argv.includes('init');
const isHelpCommand = process.argv.includes('help') || process.argv.length === 2;
const codeExtensions = {
  'javascript': '.js',
  'python': '.py'
};
const runtimes = {
  'javascript': 'javascript',
  'python': 'python'
};
const defaultModules = {
  'javascript': [
    {
      name: 'path',
      alias: 'path'
    }
  ],
  'python': [
    {
      name: 'json',
      alias: 'json'
    },
    {
      name: 'os',
      alias: 'os'
    }
  ]
}

let projectConfig = {};
let openaiConfig = {
  organization: process.env.OPENAI_ORGANIZATION,
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || 'gpt-4o'
};
let loggingConfig = {
  LOG_DEBUG_AI: process.env.LOG_DEBUG_AI == 'true'
};

if (isInitCommand || isHelpCommand) {
  projectConfig = {
    customInstructions: '',
    functionsHeader: {},
    functions: [],
    libs: [],
    runtime: {
      codeFileExtension: codeExtensions['javascript'],
      runtimeName: runtimes['javascript'],
    },
    modules: [],
    task_examples: [],
    auto_add_examples: true
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
    defaultModules: defaultModules[faqtivConfig.runtime]
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

  projectConfig = {
    instructions,
    functionsHeader,
    functions,
    libs,
    runtime,
    modules,
    taskExamples: faqtivConfig.task_examples || [],
    autoAddExamples: faqtivConfig.auto_add_examples != undefined ? faqtivConfig.auto_add_examples : false
  };
}

export const project = projectConfig;
export const openai = openaiConfig;
export const logging = loggingConfig;
export const version = '0.1.0';