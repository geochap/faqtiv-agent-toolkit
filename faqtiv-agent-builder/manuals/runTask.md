## `runTask` Function Manual

### Purpose
The `runTask` function is designed to execute a specified task within an agent's directory in a project managed using the Faqtiv command-line tool. This function assists in running tasks directly and efficiently, leveraging the configured environment for seamless task execution.

### Usage

```javascript
async function runTask(agentDirectoryPath, taskName, packedArgs = '')
```

- **Parameters:**
  - `agentDirectoryPath` (string): The path to the directory where the agent is located and where the task is defined.
  - `taskName` (string): The name of the task to be executed. This should correspond to an existing task within the agent's directory.
  - `packedArgs` (string, optional): A string representing additional arguments required by the task, separated by commas. These are processed and passed to the task execution command.

- **Returns:** A promise that resolves with the outcome of the task execution, indicating either success or detailing errors if encountered.

### How It Works

- **Argument Processing:** If additional arguments (`packedArgs`) are provided, they are split by commas and processed to be suitable for shell execution.
- **Command Execution:** The function constructs a command with necessary components, including task name and arguments, and executes it in the specified agent directory.

### Related Commands in Faqtiv

- **Run Task Command (CLI):** Users can execute tasks directly from the terminal with:

  ```bash
  faqtiv run-task <taskName> [args...]
  ```

  Replace `<taskName>` with your task identifier and append any additional arguments as needed.

### Important Considerations

- Confirm that `agentDirectoryPath` is correctly specified and accessible to avoid runtime issues.
- The task name (`taskName`) must precisely match an existing task for successful execution.
- Use caution with `packedArgs` to ensure correct argument splitting and escaping, preventing shell execution vulnerabilities.

### Best Practices

- Validate and sanitize `packedArgs` to prevent command injection risks and improve task reliability.
- Incorporate error handling for the asynchronous nature of the function to effectively manage unsuccessful task runs.
- Maintain concise and accurate documentation of tasks and arguments to facilitate easy management and debugging.