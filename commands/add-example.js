import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

import * as config from '../config.js';
const configPath = path.join('faqtiv_config.yml');
const faqtivCodeMetadataDir = '.faqtiv/code';
const tasksDir = 'tasks';
const codeDir = 'code';
const codeFileExtension = config.project.runtime.codeFileExtension;

export default function addExample(taskName, options) {
  const addAllTasks = options.all;
  const supressLogs = options.supressLogs;

  if (!fs.existsSync(configPath)) {
    console.log('faqtiv_config.yml not found');
    process.exit(1);
  }

  const log = (message) => {
    if (!supressLogs) console.log(message)
  }

  const faqtivConfig = yaml.load(fs.readFileSync(configPath, 'utf8'));

  // Check if the task_examples array exists, if not, create it
  if (!faqtivConfig.task_examples) {
    faqtivConfig.task_examples = [];
  }

  const addTask = (name) => {
    const taskFilePath = path.join(tasksDir, `${name}.txt`);
    const codeFilePath = path.join(codeDir, `${name}${codeFileExtension}`);
    const metadataFilePath = path.join(faqtivCodeMetadataDir, `${name}.yml`);

    if (!fs.existsSync(taskFilePath)) {
      if (!addAllTasks) {
        console.error(`Task '${name}' does not exist, please first run: faqtiv add-task ${name} "task description"`);
      }
      return { added: false, reason: 'missing_files' };
    }

    if (!fs.existsSync(codeFilePath)) {
      if (!addAllTasks) {
        log(`Task ${name} is not compiled, please first run: faqtiv compile-task ${name}`);
      }
      return { added: false, reason: 'missing_files' };
    }

    if (!fs.existsSync(metadataFilePath)) {
      if (!addAllTasks) {
        log(`Task metadata is missing, please first run: faqtiv compile-task ${name}`);
      }
      return { added: false, reason: 'missing_files' };
    }

    if (faqtivConfig.task_examples.includes(name)) {
      if (!addAllTasks) {
        log(`Task "${name}" is already added as an example`);
      }
      return { added: false, reason: 'already_added' };
    }

    // Add the new module to the array
    faqtivConfig.task_examples.push(name);
    return { added: true };
  };

  let addedTasks = [];
  let skippedTasksMissingFiles = [];
  let skippedTasksAlreadyAdded = [];

  if (addAllTasks) {
    const taskFiles = fs.readdirSync(tasksDir).filter(file => file.endsWith('.txt'));

    for (const file of taskFiles) {
      const taskName = path.basename(file, '.txt');
      const result = addTask(taskName);
      if (result.added) {
        addedTasks.push(taskName);
      } else if (result.reason === 'missing_files') {
        skippedTasksMissingFiles.push(taskName);
      } else if (result.reason === 'already_added') {
        skippedTasksAlreadyAdded.push(taskName);
      }
    }

    log(`Added examples: ${addedTasks.length}`);
    if (addedTasks.length > 0) {
      log(`  - ${addedTasks.join('\n  - ')}`);
    }
    log(`Skipped uncompiled tasks: ${skippedTasksMissingFiles.length}`);
    if (skippedTasksMissingFiles.length > 0) {
      log(`  - ${skippedTasksMissingFiles.join('\n  - ')}`);
    }
    log(`Skipped tasks already in examples: ${skippedTasksAlreadyAdded.length}`);
    if (skippedTasksAlreadyAdded.length > 0) {
      log(`  - ${skippedTasksAlreadyAdded.join('\n  - ')}`);
    }
  } else {
    const result = addTask(taskName);
    if (!result.added) {
      return;
    }
  }

  // Convert the updated configuration back to a YAML string
  const newYamlContent = yaml.dump(faqtivConfig);

  try {
    fs.writeFileSync(configPath, newYamlContent, 'utf8');
    if (addAllTasks) {
      log(`All tasks have been processed`);
    } else {
      log(`Task "${taskName}" has been added as an example`);
    }
  } catch (error) {
    console.error('Failed to update faqtiv_config.yml:', error.message);
    process.exit(1);
  }
}
