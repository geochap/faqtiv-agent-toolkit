## `showTask` Function Manual

### Purpose
The `showTask` function is designed to display the code for a specific task within an agent's directory in a Faqtiv-managed project. This function helps users review and analyze the task's implementation details, facilitating better understanding and management of tasks.

### Usage

```javascript
async function showTask(agentDirectoryPath, taskName)
```

- **Parameters:**
  - `agentDirectoryPath` (string): The path to the directory where the agent and its tasks are located. This is essential to identify the scope from which the task should be fetched.
  - `taskName` (string): The name of the task whose code you want to display. It should correspond to an existing task definition within the agent's directory.

- **Returns:** A promise that resolves to the code of the specified task, allowing users to view the task’s implementation details. The function uses asynchronous execution to ensure efficient processing.

### Related Commands in Faqtiv

- **Show Task Command (CLI):** You can view a task's code directly from the command line using:

  ```bash
  faqtiv show-task <taskName>
  ```

  Replace `<taskName>` with the name of the task you wish to analyze.

### Important Considerations

- Ensure that `agentDirectoryPath` is correctly specified to avoid accessing the wrong directory or encountering permission issues.
- The `taskName` should be accurate and match the task’s identifier to retrieve the correct code.

### Best Practices

- Regularly review task codes to ensure optimal functionality and make necessary improvements.
- Incorporate error handling for promised-based functions to manage and log any issues during task retrieval efficiently.
- Utilize this function in automation scripts or development environments where regular task code reviews are integral to maintaining code quality.