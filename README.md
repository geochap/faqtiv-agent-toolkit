# FAQtiv Agent Toolkit

## Introduction
FAQtiv Agent Toolkit uses genAI to write python or javascript code against a set of domain specific functions to perform tasks described in natural language. The functions, task descriptions, and a set of general instructions are all packaged into a project and a command line tool performs actions against that project to perform tasks. 

The core idea behind the tool is that code generation is a powerful mechansim for leveraging LLMs to perform actions that require multiple steps, and that by providing a set of domain specific functions for them to target, we greatly increase the reliability of the generated code by constraining the LLMs to a particular limited view of the world. 

Task descriptions are compiled into code by the tool to produce runnable tasks. The tasks can perform data retrieval, create file outputs, perform tasks against apis, etc. and can be parameterized to support greater reuse. Adding tasks to a project can be thought of as training an agent since the tasks both define specific capabilities of the agent as well as provide few shot examples for subsequent generation of new tasks. In fact, though the tool has value as a standalone utility, it is primarily intended to simplify the creation of intelligent tools/agents that be in used by higher level conversational AIs.

The name FAQtiv derives from an old side project that involved creating "Active FAQs" -- i.e. frequently asked questions that were answered by scripted live interaction with external systems. 

## Requirements

You will need node.js to install and run the toolkit and optionally `python` if you are writing a python agent (unnecessary if you're writing a node.js/javascript agent).

## Installation

You can install the toolkit from npm or install from source. 

To install from the npm:

```
npm install -g @intellidimension/faqtiv-agent-toolkit
```

To install from source, clone this repository locally and:

```
npm install 
```
When installing from source, it's often useful to use npm link so that you can use the command line directly to perform tasks:

```
npm link
```

## Usage

### Initializing a New Project
To initialize a new project, use the `init` command:

```bash
faqtiv init <projectRoot> --runtime <value>
```

- `<projectRoot>`: The root directory of the new project.
- `--runtime <value>`: The runtime environment, either `javascript` or `python`. Defaults to `javascript`.

Make sure to update the project `.env` with your OpenAI API credentials.

### Configuration

#### Environment Variables

The toolkit uses the following environment variables:

- `OPENAI_ORGANIZATION`: Your OpenAI organization ID.
- `OPENAI_API_KEY`: Your OpenAI API key.
- `OPENAI_MODEL`: The OpenAI model to use (defaults to 'gpt-4o' if not specified).
- `LOG_DEBUG_AI`: Set to 'true' to enable AI debugging logs.
- `JS_CMD`: The command to run JavaScript code (defaults to 'node' if not specified).
- `PYTHON_CMD`: The command to run Python code (defaults to 'python' if not specified).

You can set these variables in your project's `.env` file or in your system's environment.

### Getting started

Start by adding some functions and libs to your project. Functions will be provided to the LLM to use for code generation while libs are private dependencies that your functions may use but the LLM won't use directly. Be verbose in your function and argumaent naming and supply code docs as necessary to make clear to the LLM what the function does.

Note that the function code should not include library imports or requires, for that you can use the `add-module` command which will inject the dependencies for you.

### Updating Function Headers
In order to generate code first we need to generate function signature headers for your functions, use the `update-headers` command:

```bash
faqtiv update-headers
```

### Managing Tasks
Tasks are stored as text files that live within the "tasks" folder of a project. You can add, edit, or delete files in that folder manually or you can use the commands below to do the same. The task name is the file name without the .txt extension. 

#### Adding a Task
To add a new task, use the `add-task` command:

```bash
faqtiv add-task <name> <description>
```

- `<name>`: The name of the task.
- `<description>`: A brief description of the task.

#### Removing a Task
To remove an existing task, use the `remove-task` command (not implemented):

```bash
faqtiv remove-task <name>
```

- `<name>`: The name of the task.

#### Updating a Task
To update an existing task, use the `update-task` command (not implemented):

```bash
faqtiv update-task <name> <description>
```

- `<name>`: The name of the task.
- `<description>`: The updated description of the task.

### Compiling Tasks
To compile a specific task or all pending tasks, use the `compile-task` command:

```bash
faqtiv compile-task [taskName] --all
```

- `[taskName]`: The name of the task (optional).
- `--all`: Compile all pending tasks.

If the code is manually edited then this command will update the code's metadata without regenerating the code, this is needed to accurately track function dependencies for migrations.

### Running Tasks
To run a specific task, use the `run-task` command:

```bash
faqtiv run-task <taskName> [args...] --output <file> --error <file>
```

- `<taskName>`: The name of the task.
- `[args...]`: Additional arguments for the task (optional).
- `--output <file>`: The result file path, defaults to stdout.
- `--error <file>`: The error log file path, defaults to `/logs/err.log`.
- `--files <dir>`: Directory where any artifacts generated by the task will be saved, defaults to current working directory.

Run metadata will be logged with runtime information.

### Serving Agent via HTTP

To start a server that can run tasks and ad-hoc tasks via HTTP endpoints, use the `serve` command:

```bash
faqtiv serve --port <number>
```

- `--port <number>`: The port number for the server (optional, defaults to 8000).

This command starts an HTTP server with two endpoints:

1. `/run_task/{taskName}`: Runs a specific task.
   - Method: POST
   - Body: JSON object with `args` (optional), `output` (optional), `files` (optional), and `error` (optional).

2. `/run_adhoc`: Runs an ad-hoc task based on an input.
   - Method: POST
   - Body: JSON object with `input`.

Example usage with curl:

```bash
# Run a task
curl -X POST http://localhost:8000/run_task \
  -H "Content-Type: application/json" \
  -d '{"taskName": "myTask", "args": ["arg1", "arg2"]}'

# Run an ad-hoc task
curl -X POST http://localhost:8000/run_adhoc \
  -H "Content-Type: application/json" \
  -d '{"description": "Perform some ad-hoc task"}'
```

The server will respond with a JSON object containing the task result or an error message.

Useful for development and testing before exporting to a standalone agent.

### Migrating Tasks

The toolkit can detect changes based on the modification dates of functions and task text files in the `./tasks` directory to determine if code regeneration is necessary.

To execute a migration plan, use the `migrate-tasks` command:

```bash
faqtiv migrate-tasks --dry
```

- `--dry`: Display the migration plan without executing it.

### Listing Tasks
To list all existing tasks, use the `list-tasks` command:

```bash
faqtiv list-tasks
```

### Interpreter environment

#### Setup interpreter

To setup the interpreter environment, use the `setup-interpreter` command:

```bash
faqtiv setup-interpreter
```

This command will install the necessary dependencies for the interpreter runtime environment.

### Managing Modules
Modules are external javascript or pythn libraries that are required by your function libraries.

#### Adding a Module
To add a new module, use the `add-module` command:

```bash
faqtiv add-module <name> [alias] [version]
```

- `<name>`: The name of the module.
- `[alias]`: An alias for the module (optional), this is how the dependency will be avaiable to your functions.
- `[version]`: The version of the module (optional).

#### Removing a Module
To remove an existing module, use the `remove-module` command:

```bash
faqtiv remove-module <name>
```

- `<name>`: The name of the module.

#### Listing Modules
To list all existing modules, use the `list-modules` command:

```bash
faqtiv list-modules
```

#### Reinstalling Modules
To reinstall all modules, use the `reinstall-modules` command:

```bash
faqtiv reinstall-modules
```

### Managing Examples

By default all compiled tasks will be added as an example for future code generation, this helps the LLM improve it's results. This can be changed by setting `auto_add_examples: false` in your project's `faqtiv_config.yml` file.

#### Adding an Example
To add a task to examples, use the `add-example` command:

```bash
faqtiv add-example [taskName] --all
```

- `[taskName]`: The name of the task (optional).
- `--all`: Add all tasks as examples.

#### Removing an Example
To remove a task from examples, use the `remove-example` command:

```bash
faqtiv remove-example [taskName] --all
```

- `[taskName]`: The name of the task (optional).
- `--all`: Remove all examples.

#### Listing Examples
To list all existing examples, use the `list-examples` command:

```bash
faqtiv list-examples
```

### Exporting Standalone Python Langchain Agent

To export a standalone agent that can be run independently, use the `export-standalone` command:

```bash
faqtiv export-standalone <outputDir>
```

- `<outputDir>`: The directory where the standalone agent will be exported.

This command creates a standalone version of your agent, including all necessary files to run it independently. The exported agent will include:

- All tasks and examples
- All functions and libraries
- A simplified runtime environment
- A README file with instructions on how to run the standalone agent

The exported agent can be run without the full FAQtiv Agent Toolkit installed, making it easier to deploy or share your agent.

Example usage:

```bash
faqtiv export-standalone ./my-standalone-agent
```

This will create a standalone agent in the `./my-standalone-agent` directory.

To run the exported standalone agent:

1. Navigate to the exported directory
2. Install dependencies with `pip install -r requirements.txt`
3. Run a task with `python agent.py` for an interactive agent or `python agent.py --http` to serve the agent via HTTP

The HTTP api will match the same endpoints as the FAQtiv Agent Toolkit serve command.

Note: The standalone agent will not have the ability to compile new tasks or modify existing ones. It's a static export of your agent's current state.

## Help
For help with any command, use the `--help` flag:

```bash
faqtiv <command> --help
```

## Example
Here is an example of initializing a new project:

```bash
faqtiv init my_project --runtime python
```