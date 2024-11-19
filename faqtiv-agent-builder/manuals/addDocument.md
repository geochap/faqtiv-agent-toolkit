# Manual for `addDocument` Function

## Overview

The `addDocument` function facilitates the addition of a new documentation file to a specified agent's directory. It is designed to interface with a command-line utility to effectively manage documentation within an agent-based environment. The function encapsulates the process of preparing the document content and invoking the underlying system command to create and register the document.

## Function Purpose

This function is part of a larger toolkit aimed at project management and documentation maintenance. Its specific role is to enable users to add new markdown documentation files, thereby helping to maintain correct and updated project documentation. 

## Usage

### Function Signature

```javascript
async function addDocument(agentDirectoryPath, name, content)
```

### Parameters

- `agentDirectoryPath` (string): The file system path to the agent's directory where the document should be added. This is the root directory for the associated agent's assets, including existing documents.

- `name` (string): The name of the document to be added. This can be given with or without the `.md` extension. The function ensures that the document is saved with the correct markdown file extension.

- `content` (string): The content of the document in markdown format. This is the body of the document and should follow standard markdown conventions to ensure proper display and integration with other documentation files.

### Function Invocation

The `addDocument` function internally constructs a command using the provided parameters and executes it within the agent environment. It:
- Escapes the content to ensure safe shell execution.
- Constructs the command with the format: `add-document <name> <content>`.
- Executes the command using a utility function for command execution within the specified agent context.

### Execution Context

- This function is meant to be called in environments where the agent's directory is accessible and modifiable by the executor.
- It requires appropriate permissions to write within the specified directory.

### Example Call

Below is an example of how this function might be called in a JavaScript environment:

```javascript
await addDocument('/path/to/agent', 'new-guide', '# Introduction\nThis document describes...');
```

This command will add a new markdown document titled `new-guide.md` to the `/path/to/agent/docs` directory with the specified content. This assists in expanding agent documentation resources.

By understanding and following this guide, users can seamlessly update or add new documents to their project directories, ensuring that the documentation is thorough and up-to-date.