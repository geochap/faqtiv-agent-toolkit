# Manual for Running an Ad-hoc Task

## Purpose

The task is designed to execute an ad-hoc task within the faqtiv agent environment using a natural language description. This task allows for the execution of commands and operations that are not predefined within the system, facilitating on-the-fly experimentation or immediate execution of unique tasks.

## Usage

To successfully execute this task, the following parameters are required:

- `agentDirectoryPath`: The path to the directory where the faqtiv agent is located. This parameter specifies the environment in which the ad-hoc task will be run.
- `description`: A natural language description of the task to be executed. This parameter allows the user to define the task's actions without needing to write formal code or commands.

## Output

Upon successful execution of the task, a confirmation message indicating that the ad-hoc task was executed successfully will be output. Any errors or issues encountered during execution will result in the task throwing an exception with relevant details.

This task is a powerful feature that provides flexibility in operating within the faqtiv agent framework, catering to dynamic and emergent operational requirements.