## `showProjectConfig` Function Manual

### Purpose
The `showProjectConfig` function is designed to retrieve and display the configuration settings of a project managed by the Faqtiv command-line tool. Displaying the configuration allows users to view runtime environments, installed modules, and other configuration details in a structured format.

### Usage

```javascript
async function showProjectConfig(agentDirectoryPath)
```

- **Parameters:**
  - `agentDirectoryPath` (string): The path to the directory where the agent is located. This is the main directory of the project whose configuration you want to show.

- **Returns:** A promise that resolves to a JSON formatted string containing the current configuration details of the project. This includes the underlying runtime language, installed modules, and any other customizable settings.

### How It Works

- **JSON Output:** The function leverages the `executeAgentCommand` to invoke the `show-config` command with the JSON flag enabled, ensuring output is structured for easy reading and manipulation.
  
### Related Commands in Faqtiv

- **Show Config Command (CLI):** You can also display the project configuration directly from the command line by using:

  ```bash
  faqtiv show-config --json
  ```

  This command outputs the project’s configuration settings in a formatted JSON structure.

### Important Considerations

- Ensure the `agentDirectoryPath` correctly points to the desired project's root directory to fetch accurate configuration details.
- The output is formatted in JSON, which is useful for integrating with other tools or for programmatic parsing but requires some familiarity with JSON data structures.

### Best Practices

- Regularly use this function to audit and verify the configuration settings to avoid mismatches between expected and actual project setups.
- Ensure error handling for the promise to catch and address any potential issues during the command execution or data retrieval process.
- Utilize the JSON output for logging, diagnostics, or integration into CI/CD pipelines for automated environmental checks.