import fs from 'fs/promises';
import path from 'path';
import * as config from '../config.js';

async function showDocument(name) {
  try {
    const docsDir = config.project.docsDir;
    const filePath = path.join(docsDir, name);

    try {
      const content = await fs.readFile(filePath, 'utf8');
      console.log(content);
    } catch (err) {
      console.error(`Error: Document '${name}' not found`);
      process.exit(1);
    }
  } catch (err) {
    console.error('Error reading document:', err);
    process.exit(1);
  }
}

export default showDocument; 