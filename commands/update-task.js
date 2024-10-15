import fs from 'fs/promises';
import path from 'path';
import * as config from '../config.js';
import { unescapeText } from '../lib/shell-utils.js';

async function updateTask(name, description) {
  try {
    const taskFile = path.join(config.project.tasksDir, `${name}.txt`);

    // Check if the task file exists
    try {
      await fs.access(taskFile);
    } catch (error) {
      console.error(`Task "${name}" does not exist.`);
      return;
    }

    // Unescape the description
    const unescapedDescription = unescapeText(description);

    // Update the task file
    await fs.writeFile(taskFile, unescapedDescription, 'utf8');
    console.log(`Task "${name}" has been successfully updated.`);

  } catch (error) {
    console.error('Error updating task:', error.message);
  }
}

export default updateTask;