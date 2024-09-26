import fs from 'fs/promises';
import path from 'path';
import * as config from '../config.js';
import { unescapeText } from '../lib/shell-utils.js';

async function updateInstructions(newInstructions) {
  try {
    const instructionsPath = path.join(config.project.rootDir, 'instructions.txt');
    // Unescape the new instructions
    const unescapedInstructions = unescapeText(newInstructions);

    // Write new instructions to file
    await fs.writeFile(instructionsPath, unescapedInstructions, 'utf8');

    console.log('Instructions updated successfully.');
  } catch (error) {
    console.error(`Error updating instructions: ${error.message}`);
  }
}

export default updateInstructions;