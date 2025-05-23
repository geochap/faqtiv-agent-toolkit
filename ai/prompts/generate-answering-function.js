import * as config from '../../config.js';
const { runtimeName } = config.project.runtime;

const cwdPathRuntimeCode = {
  'javascript': 'path.resolve(process.cwd(), fileName)',
  'python': 'os.getcwd() + file_name'
};

const runtimeInstructions = {
  'javascript': `- Always use console.log to output information, do not use any other logging mechanism.`,
  'python': `- Always use print to output information, do not use any other logging mechanism.`
}

const basePrompt = `
You have these globally available public functions:

\`\`\`
{{functionsSignatures}}
\`\`\`

Using only these functions execute the following instructions:

In a codeblock at the top of your response write a ${runtimeName} function called doTask that fulfills the given requirements:

- Your only task is to write code for doTask and return the code with no text before or after it.
- You are limited to using the functions described above and operations on the data they return using built-in ${runtimeName} functions, otherwise reply with "The request cannot be fulfilled using the available functions" and give a detailed explanation of why.
- When calling the functions only use parameters included in the function definition and be careful to use await only if the function is async.
- Your answer is limited to a single function that only calls the public functions described above, do not use any other functions not included in this set but you don't need to use all of them.
- If you need to import any dependencies for your doTask code always do so inside the doTask function.
- Do not catch errors, let exceptions propagate.
- If there are no errors doTask must always finish by writing its result as JSON to stdout.
- If the output format is not specified, default to JSON to stdout.
- Never output anything else to stdout, any messages if needed should be included in the resulting JSON.
- Do not include any comments or documentation in your code, only the code is needed.
- Remember that you can write code to process the function results to filter or summarize them as needed if the function results are not what is needed.
- If none of the examples given to you are useful for generating the doTask function, generate the code to best of your ability based on the instructions and the available functions.
${runtimeInstructions[runtimeName]}
`;

const adHocPrompt = `
- Any values mentioned in the task description should be declared as constants inside the function doTask.
- Be very flexible and proactive, make reasonable assumptions or guesses to extract the parameters needed for the doTask function from the task description and fill in any missing information.
- Do not create files unless explicitly requested, otherwise only output plain text JSON data to stdout.
`;

const compilePrompt = `
- If doTask will generate files do not require the path or filename to be supplied as an argument, define a reasonable file name that will be written to the current working directory.
- If doTask create any files then it must write a JSON to stdout with following format: result:object (any generated text/json results), files:<path:string; mimeType:string>[] (file information of any generated files by doTask, make sure the file extension matches the mime type and the file name has a meaningful name based on the doTask parameters).
- If doTask does not create any files then it must write its result (any generated text/json results) to stdout as-is.
- To generate file paths make sure to always do this: ${cwdPathRuntimeCode[runtimeName]}.
- Only write files if explicitly specified in the task description and there's an available function for the output format.
- Parametrize doTask using your best judgment, it should take parameters if possible to reuse the function for different cases.
- If doTask needs array parameters it should accept them as packed strings delimited with |
- The function code block should only include the function code without any example calls to it.
`;

export function generateAnsweringFunctionPrompt(instructions, functionsSignatures, adHoc = false) {
  const formattedFunctions = Object.entries(functionsSignatures)
    .map(([key, value]) => `- ${value}\n`)
    .join('\n');

  let prompt = basePrompt
    .replace('{{functionsSignatures}}', formattedFunctions);
  prompt += adHoc ? adHocPrompt : compilePrompt;
  
  if (instructions) {
    prompt += `\n# TASK CODE GENERATION INSTRUCTIONS AND ADDITIONAL INFORMATION:\n${instructions}`;
  }

  return prompt;
}