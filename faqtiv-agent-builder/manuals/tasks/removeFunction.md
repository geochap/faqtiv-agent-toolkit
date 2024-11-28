# Task Manual: Remove a Function

## Purpose
The task is designed to remove an existing function from the faqtiv agent. It ensures that unwanted or obsolete functions are deleted, maintaining a clean and organized codebase within the agent directory.

## Parameters
- **agentDirectoryPath**: The path to the directory where the faqtiv agent is located. It should be a valid directory path accessible by the system.
- **functionName**: The name of the function you wish to remove from the faqtiv agent. This should be the exact name of the function as it exists in the agent's codebase.

## Usage
To remove a function from the faqtiv agent, provide the required parameters to the task. Upon successful execution, the specified function will be removed, and a confirmation message containing the function name will be returned.

## Output
The task will output a JSON object containing a result message confirming the removal of the specified function:

```json
{
  "result": "Function \"<functionName>\" removed successfully."
}
```

Replace `<functionName>` with the actual name of the function that has been removed.