# Faqtiv Agent Document Listing Task

## Purpose

The task is designed to retrieve a list of all documents associated with a specified faqtiv agent. This allows users to view document details, aiding in the management and oversight of documents within the agent.

## Functionality

- **List Documents**: The task will fetch a comprehensive list of all documents available in the specified faqtiv agent. Each document entry includes key details such as the document's name, size, and creation date.

## Parameters

- **Agent Directory Path**: The task requires the path to the agent's directory. This parameter is crucial as it directs the task to the location where the faqtiv agent is situated and where the documents are stored.

## Output

The task outputs a JSON object containing an array of document objects. Each document object consists of:

- **Name**: The name of the document.
- **Size**: The size of the document, typically in bytes.
- **Created At**: The creation timestamp of the document, indicating when it was added to the agent.

This output provides a detailed and clear representation of all documents within the agent's context, facilitating easier document management.