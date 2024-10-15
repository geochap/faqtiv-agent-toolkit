import fs from 'fs';
import path from 'path';
import * as config from '../config.js';
import { extractFunctionCode } from '../lib/parse-utils.js';

const codeDir = config.project.codeDir;
const codeFileExtension = config.project.runtime.codeFileExtension;

export default function showTask(taskName) {
  const codeFilePath = path.join(codeDir, `${taskName}${codeFileExtension}`);

  if (!fs.existsSync(codeFilePath)) {
    console.error(`Task "${taskName}" doesn't exist or hasn't been compiled yet.`);
    process.exit(1);
  }

  const code = fs.readFileSync(codeFilePath, 'utf8');
  const doTaskCode = extractFunctionCode(code, 'doTask');

  if (!doTaskCode) {
    console.error(`Could not find doTask function in "${taskName}" code.`);
    process.exit(1);
  }

  console.log(`doTask function for task "${taskName}":\n`);
  console.log(doTaskCode);
}