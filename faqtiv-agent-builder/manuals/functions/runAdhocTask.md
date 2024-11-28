## Manual for `runAdhocTask(agentDirectoryPath, description)`

### Overview

The `runAdhocTask` function is an asynchronous utility used to execute an ad-hoc task on an agent located at a specific directory path. It leverages a description provided as input to create and run these tasks dynamically. This function simplifies the process of performing custom tasks without creating permanent task files.

### Parameters

- `agentDirectoryPath` (string): The path to the directory where the agent is located. This path is essential for locating the agent's environment and executing the command.

- `description` (string): A textual description of the task to be executed. This description is used to generate and execute a temporary task on the agent.

### Usage

To use this function, call it with the appropriate parameters:

```javascript
await runAdhocTask('/path/to/agent/directory', 'Description of task');
```

### Functionality

1. **Description Handling**: The `description` is sanitized for shell execution to prevent security vulnerabilities.
2. **Command Execution**: The function internally constructs a command, `run-ad-hoc-task`, using the sanitized description, and executes this command within the context of the provided agent directory.
3. **Asynchronous Operation**: As the function is asynchronous, it returns a promise. Use `await` to handle its completion and obtain the results.

### Related Commands

The following commands are relevant to understanding the broader context of using tasks:

- **Running Ad-Hoc Tasks**:

  ```bash
  faqtiv run-ad-hoc-task <description>
  ```

  This command generates a temporary task based on the provided description, compiles it using available functions and libraries, and executes it.

### Considerations

- Ensure the `agentDirectoryPath` is accurate and accessible.
- The `description` should be detailed enough to create a meaningful task.
- Handle returned promises to manage outcomes or errors from the task execution.

By using `runAdhocTask`, you empower automated agents with the flexibility to perform dynamic operations based on succinct task descriptions.