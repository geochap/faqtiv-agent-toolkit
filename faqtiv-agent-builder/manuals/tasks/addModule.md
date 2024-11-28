# Task: Add Module to Faqtiv Agent

## Purpose

The task is designed to add a new module to the faqtiv agent, a necessary operation when extending the agent's capabilities with new functionalities provided by external modules.

## Usage

To use the task, provide the following parameters:

- `agentDirectoryPath` (string): The directory path where the faqtiv agent is located. This path indicates the agent to which the module will be added.
  
- `moduleName` (string): The name of the module to be added. This is the primary identifier for the module within the agent's configuration.

- `alias` (string, optional): An optional alias for the module. If provided, this alias can be used as a shorthand reference for the module instead of its full name.

- `version` (string, optional): An optional version number for the module. Specify this parameter if a particular version of the module is required.

## Result

Upon successful completion, the task will indicate that the module has been added to the faqtiv agent with a confirmation message. 

This task is essential for integrating additional features or dependencies into a faqtiv agent, allowing it to perform new or improved operations as defined by the included module.