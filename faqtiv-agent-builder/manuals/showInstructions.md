## `showInstructions` Function Manual

### Purpose
The `showInstructions` function is designed to display the current set of instructions for an agent within a project managed by the Faqtiv command-line tool. It is useful for reviewing the operational guidelines and protocols that an agent follows.

### Usage

```javascript
async function showInstructions(agentDirectoryPath)
```

- **Parameters:**
  - `agentDirectoryPath` (string): The path to the directory containing the agent for which you want to display the instructions. This path is crucial for locating the `instructions.txt` or equivalent instruction configuration file within the agent's environment.

- **Returns:** A promise that resolves with the current instructions for the agent, extracted from the appropriate configuration file. This includes details on the agent's operational and task executing protocols.

### How It Works

- **File Access:** The function accesses the instructions file within the specified directory path and retrieves its contents.
- **Command Execution:** Utilizes the `executeAgentCommand` to format and provide the instructions in a readable manner.

### Related Commands in Faqtiv

- **Show Instructions Command (CLI):** Users can fetch instructions directly from the command-line using:

  ```bash
  faqtiv show-instructions
  ```

  This command outputs the contents of the instructions file for the specified agent.

### Important Considerations

- Ensure that the `agentDirectoryPath` is correctly provided to access the correct directory without encountering permission or file-not-found errors.
- Instructions are a critical part of agent operations; ensure they are correctly maintained and reflect current project requirements.

### Best Practices

- Regularly review agent instructions to ensure alignment with project goals and operational updates.
- Use error handling to manage any issues with file access or incorrect directory specifications.
- Treat instruction updates with diligence to avoid miscommunication or operational errors in the agent's task execution.