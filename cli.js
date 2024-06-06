#!/usr/bin/env node

import * as config from './config.js';
import { program } from 'commander';
import init from './commands/init.js';
import updateHeaders from './commands/update-headers.js';
import compileTask, { migrateTask } from './commands/compile-task.js';
import runTask from './commands/run-task.js';
import addTask from './commands/add-task.js';
import addModule from './commands/add-module.js';
import reinstallModule from './commands/reinstall-module.js';
import listTasks from './commands/list-tasks.js';
import addExample from './commands/add-example.js';
import removeExample from './commands/remove-example.js';
import listExamples from './commands/list-examples.js';
import removeModule from './commands/remove-module.js';
import listModules from './commands/list-modules.js';

program
  .version(config.version)
  .description('FAQtiv cli');

program
  .command('init <projectRoot>')
  .option('--runtime <value>', 'runtime (javascript or python)')
  .description('Initialize a new project in the specified directory')
  .action(init);

program
  .command('update-headers')
  .description('Generate function signatures header')
  .action(updateHeaders);

program
  .command('add-task <name> <description>')
  .description('Add a new task')
  .action(addTask);

program
  .command('remove-task <name>')
  .description('Remove a task')
  .action(() => console.log('Not implemented'));

program
  .command('update-task <name> <description>')
  .description('Update a task')
  .action(() => console.log('Not implemented'));

program
  .command('compile-task [taskName]')
  .option('--all', 'All pending tasks')
  .description('Compile a task')
  .action(compileTask);

program
  .command('run-task <taskName> [args...]')
  .option('--output <file>', 'Result file path, defaults to stdout')
  .option('--error <file>', 'Error log file path, defaults to /outputs/{task}/{timestamp}/err.log')
  .description('Run a task')
  .action(runTask);

program
  .command('migrate-tasks')
  .description('Execute migration plan')
  .option('--dry', 'Display the migration plan without executing it')
  .action(migrateTask);

program
  .command('list-tasks')
  .description('Shows a list of the existing tasks')
  .action(listTasks);

program
  .command('add-module <name> [alias] [version]')
  .description('Add a new module')
  .action(addModule);

program
  .command('remove-module <name>')
  .description('Remove a module')
  .action(removeModule);

program
  .command('list-modules')
  .description('List existing modules')
  .action(listModules);

program
  .command('reinstall-modules')
  .description('Run runtime install command')
  .action(reinstallModule);

program
  .command('add-example [taskName]')
  .option('--all', 'Add all tasks as examples')
  .description('Add a task to examples')
  .action(addExample);

program
  .command('remove-example [taskName]')
  .option('--all', 'Remove all examples')
  .description('Remove a task from examples')
  .action(removeExample);

program
  .command('list-examples')
  .description('List existing examples')
  .action(listExamples);

program
  .on('--help', () => {
    console.log('\nExample call:');
    console.log('  $ faqtiv init my_project');
  });

program.parse(process.argv);
