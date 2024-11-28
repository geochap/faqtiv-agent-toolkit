
export function generateTaskManualPrompt() {
  const prompt = `
Based on the functions and documentation manuals that you used to write the doTask function, describe the task and its purpose in a markdown formatted manual.

In a codeblock at the top of your response write a documentation manual that fulfills the given requirements:

- Must be written in markdown format
- Include all the information needed to understand and use doTask but leave out any implementation details and code
- Refer to doTask as "the task" in the manual
- Give special attention to the task's inputs and outputs, describe them in detail
- Do not wrap the markdown in a codeblock
`;

  return prompt;
}