# Add a New Document to Faqtiv Agent

## Overview

The task allows you to add a new document to a specified faqtiv agent directory. This is useful for integrating documentation or other file-based resources into your faqtiv agent project.

## Purpose

The purpose of this task is to facilitate the process of documenting or adding necessary files to a faqtiv agent by programmatically inserting documents within the specified directory path.

## Usage

To use the task effectively, follow the guidelines below:

### Parameters

- **agentDirectoryPath**: The directory path where the faqtiv agent is initialized. This is the location where the new document will be added.
- **name**: The name of the document to be added. This should include the file extension as it determines the type of the document.
- **content**: The content of the document. This should be provided as a string, and it can include any text, code, or data appropriate for the document type.

### Execution

When you execute the task, it will:

1. Escape the document content to ensure it is safe for shell execution.
2. Construct a command to add the document to the specified agent directory.
3. Execute the command asynchronously.
4. Confirm the addition of the document by outputting a success message.

The task streamlines the organization and preparation of documents within your faqtiv agent, making it an essential tool for efficient project documentation and resource management.