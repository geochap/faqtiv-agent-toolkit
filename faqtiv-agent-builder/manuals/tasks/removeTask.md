# Task: Remove a Task by Name

## Purpose

The task is designed to efficiently remove a specified task from a faqtiv agent environment. It simplifies the management of tasks by allowing users to delete tasks that are no longer needed or are outdated, ensuring the agent operates with only the most relevant tasks.

## Usage

To use the task, you need to provide it with two key parameters:

1. **Agent Directory Path**: This is the directory path where the faqtiv agent is located. The task requires this path to locate the specific agent from which the task will be removed.

2. **Task Name**: This is the name of the task you wish to remove. The task identifies the target task using this name and proceeds to remove it from the agent environment.

## Output

Upon successful execution, the task will confirm the removal of the specified task by returning a message indicating the task's name and that it has been removed successfully.

## Note

Ensure that the task name you provide is accurate to avoid removing the wrong task. The removal is permanent and cannot be undone without re-adding the task manually.