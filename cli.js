#!/usr/bin/env node

import * as config from './config.js';
import { program } from 'commander';
import init from './commands/init.js';
import updateHeaders from './commands/update-headers.js';
import compileTask, { migrateTask } from './commands/compile-task.js';
import runTask from './commands/run-task.js';
import addTask from './commands/add-task.js';
import runAdHocTask from './commands/run-ad-hoc-task.js';
import addModule from './commands/add-module.js';
import reinstallModule from './commands/reinstall-module.js';
import listTasks from './commands/list-tasks.js';
import addExample from './commands/add-example.js';
import removeExample from './commands/remove-example.js';
import listExamples from './commands/list-examples.js';
import removeModule from './commands/remove-module.js';
import listModules from './commands/list-modules.js';
import printDesktopInstructions from './commands/print-desktop-instructions.js';
import setupInterpreter from './commands/setup-interpreter.js';

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
  .option('--files <dir>', 'Directory where any artifacts generated by the task will be saved, defaults to current working directory')
  .option('--error <file>', 'Error log file path, defaults to /logs/err.log')
  .description('Run a task')
  .action(runTask);

program
  .command('run-ad-hoc-task <description>')
  .description('Compile and run an ad hoc task')
  .action(runAdHocTask);

program
  .command('migrate-tasks')
  .description('Execute migration plan')
  .option('--dry', 'Display the migration plan without executing it')
  .action(migrateTask);

program
  .command('list-tasks')
  .option('--json', 'output to json')
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
  .command('print-desktop-instructions')
  .description('Prints FAQtiv desktop instructions')
  .action(printDesktopInstructions);

program
  .command('setup-interpreter')
  .description('Setup interpreter')
  .action(setupInterpreter);

program
  .on('--help', () => {
    console.log('\nExample call:');
    console.log('  $ faqtiv init my_project');
  });

program.parse(process.argv);
