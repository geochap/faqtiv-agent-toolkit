# `addModule` Manual

## Overview

The `addModule` function is an asynchronous JavaScript function designed to add modules to a project managed by a Faqtiv command-line tool. It integrates with the Faqtiv environment to facilitate seamless management of project dependencies through module addition.

## Purpose

This function is used to add external modules, which are typically JavaScript or Python libraries, required by the project's functions. This capability allows developers to manage and incorporate necessary modules efficiently within their Faqtiv-managed projects.

## Parameters

- `agentDirectoryPath`: *(string)* The file path to the agent's directory where the module is to be added. This specifies where the module will be integrated within the project’s architecture.
  
- `moduleName`: *(string)* The name of the module you wish to add. This is a required parameter and corresponds to the library you want to include in your project.
  
- `alias`: *(optional, string)* An alias for the module, if preferred. This can be used to add the module under a different name within the project.
  
- `version`: *(optional, string)* Specifies a particular version of the module to add. If not provided, the default or latest version will typically be added.

## Returns

The function returns a promise that resolves when the `add-module` command execution completes. The promise provides feedback on whether the module addition was successful or if any errors occurred during the process.

## Usage

Here's an example of how you might use the `addModule` function to add a module to your project:

```javascript
async function exampleAddModule() {
  const agentDirectoryPath = '/path/to/agent';
  const moduleName = 'lodash';
  const alias = 'underscore';
  const version = '4.17.21';

  try {
    const result = await addModule(agentDirectoryPath, moduleName, alias, version);
    console.log('Module added successfully:', result);
  } catch (error) {
    console.error('Error adding module:', error);
  }
}
```

## Additional Information

- The `addModule` function utilizes Faqtiv's `add-module` command, which should be familiar to users managing dependencies in Faqtiv-managed projects.
- This is part of a comprehensive suite of tools provided by Faqtiv to handle project and dependency management efficiently.