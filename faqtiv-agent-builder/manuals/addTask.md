## `addTask` Function Manual

### Purpose
The `addTask` function is part of the Faqtiv command-line toolset, designed to add a new task to a project. Tasks are descriptions of work that an agent can perform, relying on available functions within the project. This process allows for seamless task management and execution preparation.

### Usage

```javascript
addTask(agentDirectoryPath, taskName, description)
```

- **Parameters:**
  - `agentDirectoryPath` (string): The directory path where the agent is located. This is where the task will be added.
  - `taskName` (string): The name of the task. It should be a unique identifier within the project.
  - `description` (string): A brief description of the task, detailing what it entails or aims to accomplish.

- **Returns:** A promise that resolves with the result of the `executeAgentCommand` function, which executes the command to add a task. This includes confirmation of task addition or errors encountered during the process.

### Related Tasks Management in Faqtiv

- **Add Task Command (CLI):** Faqtiv provides a command-line interface to manage tasks, including adding them:

  ```bash
  faqtiv add-task <name> <description>
  ```

  - Replace `<name>` with your desired task name and `<description>` with a concise description of the task.

### Important Considerations

- Ensure the `agentDirectoryPath` is correctly specified and accessible.
- Use descriptive yet concise task names and descriptions to accurately reflect their function.
- This function makes use of shell commands; ensure the description text is escaped properly to prevent shell script vulnerabilities.

### Best Practices

- Ensure consistency with task names and descriptions to avoid issues in task identification and management.
- Regularly review and update task descriptions to ensure they reflect any changes in functionality or requirements.
- Implement error handling for the asynchronous nature of the function to manage and log unsuccessful task additions.