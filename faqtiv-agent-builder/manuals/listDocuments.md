## `listDocuments` Function Manual

### Purpose
The `listDocuments` function is part of the Faqtiv command-line toolset, designed to list all documentation files present in the provided agent's directory path. This helps users to ascertain which documentation resources are available for reference or updates within their project.

### Usage

```javascript
listDocuments(agentDirectoryPath)
```

- **Parameters:**
  - `agentDirectoryPath` (string): The path to the agent's directory. This is the location from which the documentation files will be listed.

- **Returns:** A promise that resolves to a JSON-formatted list of documentation files found within the specified directory. This includes filenames and other relevant metadata about the documents, allowing for easy reference.

### Functionality

- **Command Execution:** The function leverages the `executeAgentCommand` to run a listing operation, collecting and returning the document data.
- **Output Format:** By default, results are presented in JSON format, which can be used for further processing or integration with other tools within the project.

### Related Commands in Faqtiv

- **List Documents Command (CLI):** Faqtiv supports listing documents directly from the command-line interface:

  ```bash
  faqtiv list-documents --json
  ```

  Use this command to receive a JSON list of documents just like when using the function.

### Important Considerations

- Ensure that the `agentDirectoryPath` is correctly specified so that the tool can access the intended directory without any access issues.
- JSON output is essential for formatted data handling, consider transforming or processing it as needed for application in other parts of your project.

### Best Practices

- Regularly update your documentation files to reflect changes made in project code or configurations to maintain accurate references.
- Use structured filenames and directories for easier document management and retrieval.
- Implement comprehensive error handling to catch and properly log any failures in listing operations.