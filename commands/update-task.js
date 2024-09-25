import fs from 'fs/promises';
import path from 'path';
import * as config from '../config.js';

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

    // Update the task file
    await fs.writeFile(taskFile, description, 'utf8');
    console.log(`Task "${name}" has been successfully updated.`);

  } catch (error) {
    console.error('Error updating task:', error.message);
  }
}

export default updateTask;