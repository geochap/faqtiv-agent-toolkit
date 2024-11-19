## `showDocument` Function Manual

### Purpose
The `showDocument` function is a part of the Faqtiv command-line toolset, designed to display the contents of a specified document within an agent's directory. It is useful for quickly accessing and reviewing documentation files directly from the project environment.

### Usage

```javascript
async function showDocument(agentDirectoryPath, documentName)
```

- **Parameters:**
  - `agentDirectoryPath` (string): The path to the directory where the agent and its related documents are located. This determines the base location for locating the specified document.
  - `documentName` (string): The name of the document file to be displayed. It should include the file extension (e.g., `.md`, `.txt`).

- **Returns:** A promise that resolves to the content of the specified document. This output enables users to view and read the document directly through programmatic means.

### Related Commands in Faqtiv

- **Show Document Command (CLI):** The document contents can also be displayed from the command-line interface using:

  ```bash
  faqtiv show-document <name>
  ```

  Replace `<name>` with the name of the document file you wish to view.

### Important Considerations

- Verify that `agentDirectoryPath` is correctly specified to ensure the function targets the correct workspace for fetching files.
- The `documentName` should be entered with the correct filename and extension to avoid file-not-found errors.

### Best Practices

- Regularly update and maintain documentation files to ensure the content is accurate and helpful.
- Use the function to automate documentation reviews or integrate into workflows where documentation needs verification or parsing.
- Implement error handling to manage potential file access issues, such as missing files or incorrect paths.