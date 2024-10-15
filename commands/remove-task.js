import fs from 'fs/promises';
import path from 'path';
import * as config from '../config.js';
import removeExample from './remove-example.js';

async function removeTask(name) {
  try {
    const taskFile = path.join(config.project.tasksDir, `${name}.txt`);
    const codeFile = path.join(config.project.codeDir, `${name}${config.project.runtime.codeFileExtension}`);
    const metadataFile = path.join(config.project.metadataDir, `${name}.yml`);

    // Check if the task file exists
    try {
      await fs.access(taskFile);
    } catch (error) {
      console.error(`Task "${name}" does not exist.`);
      return;
    }

    // Remove the task file
    await fs.unlink(taskFile);
    console.log(`Task file "${name}.txt" has been removed.`);

    // Remove the code file if it exists
    try {
      await fs.access(codeFile);
      await fs.unlink(codeFile);
      console.log(`Code file "${name}${config.project.runtime.codeFileExtension}" has been removed.`);
    } catch (error) {
      // Code file doesn't exist
    }

    // Remove the metadata file if it exists
    try {
      await fs.access(metadataFile);
      await fs.unlink(metadataFile);
      console.log(`Metadata file "${name}.yml" has been removed.`);
    } catch (error) {
      // Metadata file doesn't exist
    }

    // Remove from examples if it exists
    try {
      await removeExample(name);
    } catch (error) {
      // Example file doesn't exist
    }

    console.log(`Task "${name}" has been successfully removed.`);

  } catch (error) {
    console.error('Error removing task:', error.message);
  }
}

export default removeTask;