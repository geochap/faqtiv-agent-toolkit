# Task: Migrate Tasks in the Faqtiv Agent

## Purpose
The task is designed to facilitate the migration of tasks within the Faqtiv agent. This process ensures that tasks are updated or modified to align with any new requirements, configurations, or improvements within the system.

## Usage

### Parameters

- `agentDirectoryPath`: The directory path where the Faqtiv agent is located. This path is required for the task to access and migrate the tasks correctly.

- `dry` (optional): A boolean parameter that, when set to true, runs a migration plan without making actual changes. This is useful for previewing the effects of the migration process before executing it.

### Output
Upon successful execution, the task returns detailed information about the migration. If `dry` mode is enabled, it provides a migration plan outlining potential changes.

## Example

To run a migration with changes applied:
```bash
# Provide the path to the agent directory
migrateTasks("/path/to/agent")
```

To run a dry migration for a plan preview:
```bash
# Provide the path to the agent directory and enable dry mode
migrateTasks("/path/to/agent", true)
```