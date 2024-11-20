# Task Overview

The task provides a means to list all the existing tasks within a specified directory of a faqtiv agent. It facilitates retrieving the current tasks associated with the agent, displaying them in a plain text format.

## Purpose

The main purpose of the task is to allow users to quickly view and assess the list of tasks that have been defined for the agent without manually navigating through files or directories. This can assist in planning, organizing, or auditing the tasks within a project.

## Usage

To use the task, you need to provide it with the path to the agent's directory. Once invoked, it will output a list of all tasks in that directory. This output can be used for reviewing, analyzing, or managing the agent's tasks more effectively.

### Input

- **agentDirectoryPath**: The directory path of the faqtiv agent whose tasks you want to list. This is a string that represents the file path to the agent directory.

### Output

- The task will produce a plain text representation of the tasks currently existing in the specified agent directory. Each task is formatted in a user-friendly way for easy reading and understanding.

## Example

Provide the appropriate agent directory path to the task, and it will output the list of tasks, which could be further used for various administrations or management purposes.