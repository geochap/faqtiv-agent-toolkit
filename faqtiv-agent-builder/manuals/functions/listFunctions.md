## `listFunctions` Function Manual

### Purpose
The `listFunctions` function is used to retrieve a list of functions within an agent's directory, formatted as JSON. This is crucial for managing and reviewing the functions in a project that utilizes the Faqtiv tool, enabling users to efficiently access details about available functions and libraries.

### Usage

```javascript
listFunctions(agentDirectoryPath)
```

- **Parameters:**
  - `agentDirectoryPath` (string): The path to the directory where the agent and its associated functions reside. This directory serves as the focal point for the listing process.

- **Returns:** A promise that resolves with the output from the `executeAgentCommand` function. This output includes a JSON list of functions and libraries within the specified project directory, detailing their names and code content.

### Related Commands in Faqtiv

- **List Functions Command (CLI):** You can also perform this task from the command line using:

  ```bash
  faqtiv list-functions --json
  ```

  This command provides a similar JSON formatted output listing all available functions and their details in the project directory.

### Important Considerations

- Ensure the `agentDirectoryPath` is accurately specified so the command has access to the correct workspace.
- The listing is in JSON format, which can be beneficial for parsing or integrating with other systems or tools within your project.

### Best Practices

- Regularly list functions to maintain an updated view of the project components and identify opportunities for refactoring or documentation.
- Incorporate error handling to manage any failures during the listing process effectively.
- Use the JSON output to automate documentation or further processing within continuous integration/continuous deployment (CI/CD) pipelines.