import fs from 'fs';
import path from 'path';
import * as config from '../config.js';
import { unescapeText } from '../lib/shell-utils.js';

const tasksDir = config.project.tasksDir;

export default async function(name, description) {
  try {
    const filePath = path.join(tasksDir, `${name}.txt`);
  
    if (fs.existsSync(filePath)) {
      console.log(`Task "${name}" already exists`);
      process.exit(1);
    }

    // Unescape the description
    const unescapedDescription = unescapeText(description);

    fs.writeFileSync(filePath, unescapedDescription, 'utf8');
    console.log(`Task created: ${filePath}`);
  } catch(e) {
    console.log('Task creation failed: ', e.message);
    process.exit(1);
  }
}