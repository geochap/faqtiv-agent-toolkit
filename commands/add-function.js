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

    // Unescape the code based on the operating system
    const unescapedCode = unescapeCode(code);
    console.warn(code)
    console.warn(unescapedCode)

    // Write the unescaped code to the file
    await fs.writeFile(filePath, unescapedCode, { encoding: 'utf8', flag: 'w' });

    console.log(`Function '${name}' has been added successfully.`);
  } catch (error) {
    console.error(`Error adding function: ${error.message}`);
  }
}

// Helper function to unescape the code
function unescapeCode(code) {
  const isWindows = process.platform === 'win32';
  
  if (isWindows) {
    return code
      .replace(/`n/g, '\n')      // Convert PowerShell newline to actual newline
      .replace(/``/g, '`')       // Unescape backticks
      .replace(/""/g, '"')       // Unescape double quotes
      .replace(/`\$/g, '$')      // Unescape dollar signs
      .replace(/\\\\/g, '\\');   // Unescape backslashes
  } else {
    return code
      .replace(/\\n/g, '\n')     // Convert escaped newline to actual newline
      .replace(/\\`/g, '`')      // Unescape backticks
      .replace(/\\"/g, '"')      // Unescape double quotes
      .replace(/\\\$/g, '$')     // Unescape dollar signs
      .replace(/\\\\/g, '\\');   // Unescape backslashes
  }
}

export default addFunction;