import fs from 'fs';
import path from 'path';
import { getAllFiles } from '../lib/file-utils.js';
import yaml from 'js-yaml';
import * as config from '../config.js';

const tasksDir = path.join('tasks');
const faqtivCodeMetadataDir = path.join('.faqtiv', 'code');
const codeDir = path.join('code');
const codeFileExtension = config.project.runtime.codeFileExtension;

export default function(options) {
  const jsonOutput = options.json;
  const taskFiles = getAllFiles(tasksDir, '.txt');
  const uncompiled = [];
  const compiled = [];

  for (const file of taskFiles) {
    const taskName = file.relativePath.replace('.txt', '');

    const jsFilePath = path.join(codeDir, `${taskName}${codeFileExtension}`);
    const metdataFilePath = path.join(faqtivCodeMetadataDir, `${taskName}.yml`);

    if (!fs.existsSync(jsFilePath) || !fs.existsSync(metdataFilePath)) {
      uncompiled.push(taskName);
      continue;
    }
    
    const metadata = yaml.load(fs.readFileSync(metdataFilePath, 'utf8'));

    compiled.push(`${taskName}${metadata.output.description}`);
  }

  if (!jsonOutput) {
    if (compiled.length > 0) {
      console.log('Compiled tasks:');
      console.log(compiled.join('\n'));
    }
    if (uncompiled.length > 0) {
      console.log('\nUncompiled tasks:');
      console.log(uncompiled.join('\n'));
    }
  } else {
    console.log(JSON.stringify({
      compiled,
      uncompiled
    }));
  }
}