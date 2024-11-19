## `listTasks` Function Manual

### Purpose
The `listTasks` function is utilized to list all tasks defined within an agent's directory in a Faqtiv-managed project. This function helps users to view and manage task workflows efficiently, providing a clear overview of all tasks that an agent can execute.

### Usage

```javascript
listTasks(agentDirectoryPath)
```

- **Parameters:**
  - `agentDirectoryPath` (string): Path to the agent's directory where tasks are stored. This is the directory from which the tasks will be listed.

- **Returns:** A promise that resolves to the output from the `executeAgentCommand` function, detailing all existing tasks in the agent's directory. The list includes task names and descriptions, formatted as structured data, making it suitable for further processing or reference.

### Related Commands in Faqtiv

- **List Tasks Command (CLI):** You can list all tasks directly using Faqtiv's command-line interface:

  ```bash
  faqtiv list-tasks
  ```

  This command outputs a structured list of all tasks similar to the function's return, enabling easy access to task details.

### Important Considerations

- Ensure that `agentDirectoryPath` points to the correct directory for accurate task retrieval.
- The function output is typically structured data, which is useful for task tracking or integration into other project management tools.

### Best Practices

- Regularly list tasks to maintain up-to-date knowledge of tasks and manage project workflows effectively.
- Implement robust error handling to capture and address any issues during the task listing process efficiently.
- Use the listing output for project documentation or to facilitate automated tools that might require insights into available tasks for execution or monitoring.