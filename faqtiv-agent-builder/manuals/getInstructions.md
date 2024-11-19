## `getInstructions` Function Manual

### Purpose
The `getInstructions` function is used to obtain the current set of instructions for a specified agent within a Faqtiv-managed project. These instructions guide the agent's operations and tasks within its environment, ensuring coordinated and efficient functionality.

### Usage

```javascript
getInstructions(agentDirectoryPath)
```

- **Parameters:**
  - `agentDirectoryPath` (string): The path to the directory containing the agent whose instructions you want to retrieve. This identifies the specific agent within the project setup.

- **Returns:** A promise that resolves to the current instructions for the agent, extracted from the agent's directory. The instructions provide guidance on operational protocols and task management.

### Related Commands in Faqtiv

- **Show Instructions Command (CLI):** Faqtiv allows users to fetch agent instructions directly via the CLI:

  ```bash
  faqtiv show-instructions
  ```

  - This command will display the instructions stored in the `instructions.txt` file for the specified agent.

### Important Considerations

- Ensure the `agentDirectoryPath` is correctly specified and points to a valid agent setup.
- The function relies on asynchronous processes, so implement promise-based handling for smooth error management and response handling.

### Best Practices

- Regularly update and review agent instructions to align with project objectives and operational changes.
- Use error and exception handling to manage unsuccessful attempts at retrieving instructions.
- Maintain consistent formatting for instructions files to ensure accurate parsing and comprehension by the function.