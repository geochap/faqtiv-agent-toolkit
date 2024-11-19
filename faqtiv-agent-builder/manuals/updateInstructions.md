## `updateInstructions` Function Manual

### Purpose
The `updateInstructions` function is used to update the instructions for an agent within a project managed using the Faqtiv command-line tool. This function ensures that the agent's current operational instructions are replaced with new ones provided by the user, allowing for timely updates as project needs evolve.

### Usage

```javascript
async function updateInstructions(agentDirectoryPath, newInstructions)
```

- **Parameters:**
  - `agentDirectoryPath` (string): The path to the directory where the agent's instruction files are located. It is essential for directing the update process to the correct location.
  - `newInstructions` (string): The new instructions to replace existing ones. This will be securely escaped for shell safety to prevent injection vulnerabilities during execution.

- **Returns:** A promise that resolves with the result from executing the command to update the instructions. This includes a confirmation of success or any error messages encountered during the process.

### Functionality

- **Instruction Update:** This function allows the direct replacement of an agent’s instruction set, ensuring that the agent operates under the latest guidelines as specified by the user.

### Related Commands in Faqtiv

- **Update Instructions Command (CLI):** Instructions can also be updated using Faqtiv CLI with:

  ```bash
  faqtiv update-instructions <newInstructions>
  ```

  Replace `<newInstructions>` with the new set of instructions you want to implement.

### Important Considerations

- Double-check the `agentDirectoryPath` to ensure it points to the correct directory; mistakes can lead to updating incorrect instructions.
- Carefully validate and format the `newInstructions` input to prevent syntax errors or operational misguidance.

### Best Practices

- Perform regular updates of agent instructions to ensure they remain relevant and aligned with project developments.
- Employ thorough validation of instruction text to safeguard against potential injection risks and syntax errors.
- Implement comprehensive error handling within the promise to track and manage any issues encountered during the update process.