```markdown
# `executeCommand` Function Manual

## Overview

`executeCommand` is an asynchronous JavaScript function designed to execute shell commands within a specified directory. It provides a promise-based interface to run commands, handle outputs, errors, and supports dynamic setting of the working directory (`cwd`) based on the command input.

## Function Signature

```javascript
async function executeCommand(directoryPath, args);
```

- **Parameters:**

  - `directoryPath` (String): The path to the directory where the command should be executed. If the command is 'init', this parameter is ignored.
  
  - `args` (Array): An array of string arguments representing the command and its options. The first element should be the command name.

- **Returns:**

  - Returns a `Promise` which resolves with the standard output of the executed command, or rejects with an error message if the command fails.

## Behavior

1. **Initial Command Check**:
   - When the first argument (`args[0]`) is `'init'`, the function sets the `cwd` (current working directory) to be `undefined`. This behavior allows global commands (like initialization) that do not necessarily need a specific directory.

2. **Directory Validity Check**:
   - If the specified `directoryPath` is not valid (either not provided or does not exist), and the command is not 'init', the function will immediately reject the promise with a "Directory doesn't exist" error.

3. **Command Execution**:
   - The function utilizes Node.js's `child_process.spawn` to execute the shell command.

4. **Output Management**:
   - It captures the outputs using stdout and stderr streams.
   - On successful execution:
     - Resolves with `stdout` if it contains data, or `stderr` if `stdout` is empty.
   - On encountering errors or non-zero exit code, it rejects with an error containing `stderr` or a generic message if it's absent.

5. **Error Handling**:
   - Listens for errors emitted by the child process and rejects with a detailed error message if any occur during the command setup or execution.

## Important Considerations

- **Command Security**: As the function uses `shell: true` in `spawn`, it is susceptible to shell-injection attacks. Ensure inputs are sanitized to avoid executing malicious commands.
- **Platform Compatibility**: The option `windowsHide: true` is included to help in hiding the console window on Windows platforms that might pop up for spawned commands.
- **Asynchronous Nature**: Ensure you handle the returned promise properly using `.then()` and `.catch()` for successful and error scenarios, respectively.

## Examples

### Example 1: Running a Git Command

```javascript
executeCommand('/path/to/repo', ['git', 'status'])
  .then(output => console.log(output))
  .catch(error => console.error(error.message));
```

### Example 2: Initializing a New Git Repository

```javascript
executeCommand(null, ['git', 'init'])
  .then(output => console.log(output))
  .catch(error => console.error(error.message));
```

These examples demonstrate how to call `executeCommand` to run a `git status` command within a specified directory and initialize a new Git repository globally using 'init'.
```