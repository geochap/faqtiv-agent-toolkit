import fs from 'fs/promises';
import path from 'path';
import * as config from '../config.js';

export default async function updateFunction(name, newCode) {
  try {
    const functionPath = path.join(config.project.functionsDir, `${name}.js`);

    // Check if the function file exists
    try {
      await fs.access(functionPath);
    } catch (error) {
      console.error(`Function '${name}' does not exist.`);
      return;
    }

    // Update the function file with the new code
    await fs.writeFile(functionPath, newCode, 'utf8');
    console.log(`Function '${name}' has been updated successfully.`);
  } catch (error) {
    console.error('Error updating function:', error.message);
  }
}