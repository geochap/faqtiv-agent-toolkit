import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { getAllFiles } from '../lib/file-utils.js';
import { extractFunctionCode, getFunctionParameters } from '../lib/parse-utils.js';
import * as config from '../config.js';

const tasksDir = config.project.tasksDir;
const faqtivCodeMetadataDir = config.project.metadataDir;
const codeDir = config.project.codeDir;
const codeFileExtension = config.project.runtime.codeFileExtension;

export default function(options) {
  const jsonOutput = options.json;
  const taskFiles = getAllFiles(tasksDir, '.txt');
  const uncompiled = [];
  const compiled = [];

  if (jsonOutput) {
    for (const file of taskFiles) {
      const taskName = file.relativePath.replace('.txt', '');
  
      const jsFilePath = path.join(codeDir, `${taskName}${codeFileExtension}`);
      const metdataFilePath = path.join(faqtivCodeMetadataDir, `${taskName}.yml`);
  
      if (!fs.existsSync(jsFilePath) || !fs.existsSync(metdataFilePath)) {
        continue;
      }
      
      const metadata = yaml.load(fs.readFileSync(metdataFilePath, 'utf8'));
  
      compiled.push(JSON.parse(metadata.output.task_schema));
    }

    return console.log(JSON.stringify(compiled, null, 2));
  }

  for (const file of taskFiles) {
    const taskName = file.relativePath.replace('.txt', '');

    const jsFilePath = path.join(codeDir, `${taskName}${codeFileExtension}`);
    const metdataFilePath = path.join(faqtivCodeMetadataDir, `${taskName}.yml`);

    if (!fs.existsSync(jsFilePath) || !fs.existsSync(metdataFilePath)) {
      uncompiled.push(taskName);
      continue;
    }
    
    const code = fs.readFileSync(jsFilePath, 'utf8');
    const doTask = extractFunctionCode(code, 'doTask');
    const taskParameters = getFunctionParameters(doTask);

    compiled.push(`${taskName}(${taskParameters.join(', ')})`);
  }

  if (compiled.length > 0) {
    console.log('Compiled tasks:');
    console.log(compiled.join('\n'));
  }
  if (uncompiled.length > 0) {
    console.log('\nUncompiled tasks:');
    console.log(uncompiled.join('\n'));
  }
}