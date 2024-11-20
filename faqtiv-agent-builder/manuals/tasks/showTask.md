# Task Documentation Manual

## Purpose

The task is designed to retrieve and output the code of a specified task from a faqtiv agent. It allows users to obtain the details of tasks that have been previously defined within the agent's directory.

## How to Use

To use the task, you must provide the following parameters:

- `agentDirectoryPath`: The path to the directory where the faqtiv agent is initialized. This is essential for locating the specific agent whose task code you want to retrieve.
  
- `taskName`: The name of the task whose code you wish to output. It should match the exact name of the task as stored in the agent's directory.

## Output

Upon successful execution, the task will output a JSON object containing the detailed information and code of the specified task. This output allows users to review or utilize the task code for further development or troubleshooting.

## Important Notes

- Ensure that the provided `agentDirectoryPath` and `taskName` are accurate to prevent errors in locating and retrieving the task information.
- The task is specifically used for retrieving task details and does not perform any modifications or compilations on the task itself.