import fs from 'fs/promises';
import path from 'path';
import * as config from '../config.js';

async function addFunction(name, code) {
  try {
    const functionsDir = config.project.functionsDir;

    const fileName = `${name}${config.project.runtime.codeFileExtension}`;
    const filePath = path.join(functionsDir, fileName);

    // Check if the function already exists
    try {
      await fs.access(filePath);
      console.error(`Error: Function '${name}' already exists.`);
      return;
    } catch (error) {
      // File doesn't exist, we can proceed
    }

    // Convert literal \n to actual newlines
    const processedCode = code.replace(/\\n/g, '\n');

    // Write the processed code to the file
    await fs.writeFile(filePath, processedCode, { encoding: 'utf8', flag: 'w' });

    console.log(`Function '${name}' has been added successfully.`);
  } catch (error) {
    console.error(`Error adding function: ${error.message}`);
  }
}

export default addFunction;