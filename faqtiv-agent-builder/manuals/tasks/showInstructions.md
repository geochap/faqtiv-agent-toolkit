# Agent Instructions Retrieval Task Manual

## Purpose

The task provides a mechanism to retrieve and display the instructions of a specified faqtiv agent. The instructions detail the operational procedures, guidelines, or any predefined directives associated with the agent, aiding users in understanding how to interact with or utilize the agent effectively.

## Usage

To perform the task, the user must specify the directory path of the faqtiv agent whose instructions are sought. The task will access and fetch the instructional content of the agent located at the given directory path.

### Required Parameters

- **Agent Directory Path**: This is the file system path where the faqtiv agent is located. The task uses this path to locate the specific agent and retrieve its instructions.

### Output

Upon successful execution, the task will output a JSON object with the following format:

- **result**: Contains the retrieved instructions as a string. This string includes all relevant information or directives pertaining to the agent.

### Example

When invoked with the appropriate directory path, the task efficiently outputs the agent's instructions, facilitating better understanding and interaction with the agent.

This task is essential for users who need to access the procedural or operational guidelines of faqtiv agents without directly inspecting the internal files or configuration settings.