## `migrateTasks` Function Manual

### Purpose
The `migrateTasks` function is specifically designed to facilitate the migration of tasks within a Faqtiv-managed project. This function detects changes in task-related files and executes a migration plan, enabling seamless updates and adaptations to tasks based on changes in function implementations or task descriptions.

### Usage

```javascript
migrateTasks(agentDirectoryPath, dry = false)
```

- **Parameters:**
  - `agentDirectoryPath` (string): The path to the directory of the agent where the tasks are stored and migrations should be applied.
  - `dry` (boolean, optional): A flag that determines whether to execute the migration plan or only display it. When set to `true`, the function will only show what the migration plan entails without making any changes.

- **Returns:** A promise that resolves with the output of `executeAgentCommand`, detailing the results of the migration operation. This includes information on successful migrations or errors if encountered.

### Functionality

- **Migration Detection:** Automatically detects modification dates of function and task files in the `./tasks` directory to determine what requires updating.
- **Plan Execution:** Depending on the `dry` flag, it will either execute the migration plan or provide a preview, allowing for cautious management of task updates.

### Related Commands in Faqtiv

- **Migrate Tasks Command (CLI):** You can execute a migration plan from the command line with:

  ```bash
  faqtiv migrate-tasks --dry
  ```

  Add the `--dry` flag to view the migration plan without applying it.

### Important Considerations

- Ensure `agentDirectoryPath` is correctly specified and accessible.
- Using the `dry` option is recommended for reviewing what changes will be made before executing the actual migration.
- The function relies on updated modification dates; ensure this aspect is considered in your workflow to avoid unnecessary migrations.

### Best Practices

- Regularly execute migrations to keep tasks up-to-date with the latest function implementations.
- Review migration plans with the `dry` option to avoid accidental changes to essential task operations.
- Implement error handling for the promise to capture and deal with any migration issues effectively.