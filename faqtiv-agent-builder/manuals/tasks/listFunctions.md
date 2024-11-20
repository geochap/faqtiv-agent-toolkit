# Task Manual: List Agent Functions

## Purpose

The task is designed to retrieve and display a list of all functions present in a specified faqtiv agent. The task queries the agent's directory to obtain detailed information about the functions available within the agent, making it easier for users to understand what operations are supported.

## Parameters

- `agentDirectoryPath`: This parameter specifies the path to the directory where the faqtiv agent is located. It is crucial to provide the correct directory path to ensure that the task retrieves the functions from the intended agent.

## Output

The task outputs a JSON string containing a list of functions. Each function is represented with the following information:

- `name`: The name of the function.
- `parameters`: An array of strings, each representing a parameter required by the function.
- `returnType`: A string indicating the return type of the function.

The output helps users identify the functions' capabilities and understand their structure in terms of inputs and outputs.

## Usage

To use the task, provide the appropriate `agentDirectoryPath` where the faqtiv agent resides. Ensure that this path is accessible and that the agent contains functions. Upon execution, the task will output the list of functions in JSON format, allowing users to view and utilize the functions as needed.

By listing all functions, users can effectively manage and leverage the capabilities of their faqtiv agent for various automation and computational tasks.