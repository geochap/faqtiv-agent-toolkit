import * as config from '../../config.js';
const { runtimeName } = config.project.runtime;

const cwdPathRuntimeCode = {
  'javascript': 'path.resolve(process.cwd(), fileName)',
  'python': 'os.getcwd() + file_name'
};

const filePrompts = `
- If doTask will generate files do not require the path or filename to be supplied as an argument, define a reasonable file name that will be written to the current working directory.
- If doTask create any files then it must write a JSON to stdout with following format: result:object (any generated text/json results), files:<path:string; mimeType:string>[] (file information of any generated files by doTask, make sure the file extension matches the mime type and the file name has a meaningful name based on the doTask parameters).
- If doTask does not create any files then it must write its result (any generated text/json results) to stdout as-is.
- To generate file paths make sure to always do this: ${cwdPathRuntimeCode[runtimeName]}.
- Don't create files unless explictly requested by the user.
`;

export function generateAnsweringFunctionPrompt(instructions, functionsSignatures, adHoc = false) {
  const prompt = `
You have these globally available public functions:

${functionsSignatures}

Using only these functions execute the following instructions:

In a codeblock at the top of your response write a ${runtimeName} function called doTask that fulfills the given requirements:

- When calling the functions only use parameters included in the function definition and be careful to use await only if the function is async.
- Your answer is limited to a single function that only calls the public functions described above, do not use any other functions not included in this set but you don't need to use all of them.
- If you need to import any dependencies for your doTask code always do so inside the doTask function.
- Parametrize doTask using your best judgment, it should take parameters if possible to reuse the function for different cases.
- If doTask needs array parameters it should accept them as packed strings delimited with |
- Do not catch errors, let exceptions propagate.
- If there are no errors doTask must always finish by writing its result as JSON to stdout.
- Never output anything else to stdout, any messages if needed should be included in the resulting JSON.
- Do not include any comments or documentation in your code, only the code is needed.
${adHoc ? 
`- Your code must call the doTask function with the parameters inferred from the user request.
- Never generate files, write the data as JSON to stdout as-is.
- Ignore any functions which generate files.` :
`
${filePrompts}
- The function code block should only include the function code without any example calls to it.`
}

${instructions ?
`TASK INSTRUCTIONS:
${instructions}`
:
''
}
  `;

  return prompt;
}
