# FAQtiv Agent Toolkit User Guide

## Introduction
FAQtiv Agent Toolkit is a command line toolkit designed to help users generate code using a Large Language Model (LLM) from task text descriptions. 

It supports Node.js and Python 3 runtimes and relies on user-provided functions located in the `./functions` directory to generate the code.

## Requirements

To use it the your environment where you create a FAQtiv project needs to support your chosen environment so either `node` or `python3` must be available.

## Usage

### Initializing a New Project
To initialize a new project, use the `init` command:

\```bash
faqtiv init <projectRoot> --runtime <value>
\```

- `<projectRoot>`: The root directory of the new project.
- `--runtime <value>`: The runtime environment, either `javascript` or `python`. Defaults to `javascript`.

Make sure to update the project `.env` with your OpenAI API credentials.

### Getting started

Start by adding some functions and libs to your project, functions will be provided to the LLM to use for code generation while libs are private dependencies that your functions may use but the LLM won't.

Note that the function code should not include library imports or requires, for that you can use the `add-module` command which will inject the dependencies for you.

### Updating Function Headers
In order to generate code first we need to generate function signature headers for your functions, use the `update-headers` command:

\```bash
faqtiv update-headers
\```

### Managing Tasks

#### Adding a Task
To add a new task, use the `add-task` command:

\```bash
faqtiv add-task <name> <description>
\```

- `<name>`: The name of the task.
- `<description>`: A brief description of the task.

#### Removing a Task
To remove an existing task, use the `remove-task` command (not implemented):

\```bash
faqtiv remove-task <name>
\```

- `<name>`: The name of the task.

#### Updating a Task
To update an existing task, use the `update-task` command (not implemented):

\```bash
faqtiv update-task <name> <description>
\```

- `<name>`: The name of the task.
- `<description>`: The updated description of the task.

### Compiling Tasks
To compile a specific task or all pending tasks, use the `compile-task` command:

\```bash
faqtiv compile-task [taskName] --all
\```

- `[taskName]`: The name of the task (optional).
- `--all`: Compile all pending tasks.

If the code is manually edited then this command will update the code's metadata without regenerating the code, this is needed to accurately track function dependencies for migrations.

### Running Tasks
To run a specific task, use the `run-task` command:

\```bash
faqtiv run-task <taskName> [args...] --output <file> --error <file>
\```

- `<taskName>`: The name of the task.
- `[args...]`: Additional arguments for the task (optional).
- `--output <file>`: The result file path, defaults to stdout.
- `--error <file>`: The error log file path, defaults to `/outputs/{task}/{timestamp}/err.log`.

A metadata file will be created at `/outputs/{task}/{timestamp}/metadata.yaml` with runtime information.

### Migrating Tasks

The toolkit can detect changes based on the modification dates of functions and task text files in the `./tasks` directory to determine if code regeneration is necessary.

To execute a migration plan, use the `migrate-tasks` command:

\```bash
faqtiv migrate-tasks --dry
\```

- `--dry`: Display the migration plan without executing it.

### Listing Tasks
To list all existing tasks, use the `list-tasks` command:

\```bash
faqtiv list-tasks
\```

### Managing Modules

#### Adding a Module
To add a new module, use the `add-module` command:

\```bash
faqtiv add-module <name> [alias] [version]
\```

- `<name>`: The name of the module.
- `[alias]`: An alias for the module (optional), this is how the dependency will be avaiable to your functions.
- `[version]`: The version of the module (optional).

#### Removing a Module
To remove an existing module, use the `remove-module` command:

\```bash
faqtiv remove-module <name>
\```

- `<name>`: The name of the module.

#### Listing Modules
To list all existing modules, use the `list-modules` command:

\```bash
faqtiv list-modules
\```

#### Reinstalling Modules
To reinstall all modules, use the `reinstall-modules` command:

\```bash
faqtiv reinstall-modules
\```

### Managing Examples

By default all compiled tasks will be added as an example for future code generation, this helps the LLM improve it's results. This can be changed by setting `auto_add_examples: false` in your project's `faqtiv_config.yml` file.

#### Adding an Example
To add a task to examples, use the `add-example` command:

\```bash
faqtiv add-example [taskName] --all
\```

- `[taskName]`: The name of the task (optional).
- `--all`: Add all tasks as examples.

#### Removing an Example
To remove a task from examples, use the `remove-example` command:

\```bash
faqtiv remove-example [taskName] --all
\```

- `[taskName]`: The name of the task (optional).
- `--all`: Remove all examples.

#### Listing Examples
To list all existing examples, use the `list-examples` command:

\```bash
faqtiv list-examples
\```

## Help
For help with any command, use the `--help` flag:

\```bash
faqtiv <command> --help
\```

## Example
Here is an example of initializing a new project:

\```bash
faqtiv init my_project --runtime python
\```
