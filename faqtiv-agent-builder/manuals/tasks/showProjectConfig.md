# Show Project Configuration Manual

## Purpose

The task is designed to retrieve and display the project configuration of a faqtiv agent. This enables users to understand the current settings and environment in which the agent operates. It helps in inspecting configuration details to ensure that they align with the intended setup or for debugging purposes.

## Usage

To utilize the task, you need to provide the directory path where the agent is located. The task will then access and display the configuration details in JSON format.

## Parameters

- `agentDirectoryPath`: A string indicating the path to the directory where the faqtiv agent resides. This path is necessary for the task to locate the agent and access its configuration files.

## Output

The task outputs the configuration details of the specified faqtiv agent as a JSON object. This output includes various key-value pairs representing the settings and parameters configured for the agent.

## Example

When you wish to see the configuration of an agent located in a directory, you provide the directory path, and the task will return a JSON object with the configuration details. This object might include settings like environment variables, module versions, or other configuration specifics.

This tool is useful for examining and verifying the configurations for auditing, debugging, or documentation purposes.