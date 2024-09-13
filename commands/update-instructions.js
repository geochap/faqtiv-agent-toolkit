import fs from 'fs/promises';
import path from 'path';
import * as config from '../config.js';

async function updateInstructions(newInstructions) {
  try {
    const instructionsPath = path.join(config.project.rootDir, 'instructions.txt');
    // Write new instructions to file
    await fs.writeFile(instructionsPath, newInstructions);

    console.log('Instructions updated successfully.');
  } catch (error) {
    console.error(`Error updating instructions: ${error.message}`);
  }
}

export default updateInstructions;