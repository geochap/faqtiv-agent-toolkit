# Task: Retrieve and Display Document Content

## Purpose

The task is designed to retrieve the contents of a specified document from a faqtiv agent's directory. It is useful for users who need to view the contents of documents stored within the agent's environment without directly accessing file systems.

## Parameters

- `agentDirectoryPath`: A string representing the path to the faqtiv agent's directory where the documents are stored.
- `documentName`: A string specifying the name of the document whose content needs to be retrieved.

## Usage

When executed, the task will access the document specified by `documentName` within the directory given by `agentDirectoryPath`. It retrieves the document's content and outputs the result in JSON format, providing a structured and easily readable output. This allows users to quickly access the necessary information from documents stored in the faqtiv agent's directory.

## Output

The task returns a JSON object containing the result, which includes the content of the specified document. This output can be used for further processing or simply for viewing the document's information in a structured format.