import fs from 'fs/promises';
import path from 'path';
import * as config from '../config.js';

export default async function removeFunction(name) {
  try {
    const functionPath = path.join(config.project.functionsDir, `${name}.js`);

    // Check if the function file exists
    try {
      await fs.access(functionPath);
    } catch (error) {
      console.error(`Function '${name}' does not exist.`);
      return;
    }

    // Remove the function file
    await fs.unlink(functionPath);
    console.log(`Function '${name}' has been removed successfully.`);
  } catch (error) {
    console.error('Error removing function:', error.message);
  }
}