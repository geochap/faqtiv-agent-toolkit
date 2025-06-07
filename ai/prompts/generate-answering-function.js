import * as config from '../../config.js';
const { runtimeName } = config.project.runtime;

const runtimeConfig = {
  javascript: {
    codeBlockLang: 'javascript',
    logFunction: 'console.log(JSON.stringify(result, null, 2))',
    asyncKeyword: 'async ',
    awaitKeyword: 'await ',
    outputInstruction: '- Always use `console.log` to output information. Do not use any other logging mechanism.',
    adhocExample: `
\`\`\`javascript
async function doTask(bankName, minAssets) {
  const datasetQuery = createDatasetQuery("institutions")
  const queryWithFilter = addEqualityFilterToDatasetQuery(datasetQuery, "BANK_NAME", bankName)
  const queryWithRange = addRangeFilterToDatasetQuery(queryWithFilter, "TOTAL_ASSETS", minAssets, Infinity)

  const queryResult = await evaluateDatasetQuery(queryWithRange)

  console.log(JSON.stringify(queryResult, null, 2))
}

async function doAdhocTask() {
  const bankName = "Example Bank"
  const minAssets = 1000000

  await doTask(bankName, minAssets)
}
\`\`\`
`
  },
  python: {
    codeBlockLang: 'python',
    logFunction: 'print(json.dumps(result, indent=2))',
    asyncKeyword: '',
    awaitKeyword: '',
    outputInstruction: '- Always use `print` to output information. Do not use any other logging mechanism.',
    adhocExample: `
\`\`\`python
def doTask(bank_name, min_assets):
    dataset_query = createDatasetQuery("institutions")
    query_with_filter = addEqualityFilterToDatasetQuery(dataset_query, "BANK_NAME", bank_name)
    query_with_range = addRangeFilterToDatasetQuery(query_with_filter, "TOTAL_ASSETS", min_assets, float("inf"))

    query_result = evaluateDatasetQuery(query_with_range)

    print(json.dumps(query_result, indent=2))

def doAdhocTask():
    bank_name = "Example Bank"
    min_assets = 1000000

    doTask(bank_name, min_assets)
\`\`\`
`
  }
};

const configForRuntime = runtimeConfig[runtimeName];

const basePrompt = `
You have these globally available public functions:

\`\`\`
{{functionsSignatures}}
\`\`\`

Using only these functions, execute the following instructions:

In a codeblock at the top of your response, write the required function(s) that fulfill the task.

- You are limited to using the functions described above and operations on the data they return using built-in ${runtimeName} functions.
- If the request cannot be fulfilled using the available functions, reply with: "The request cannot be fulfilled using the available functions" and give a detailed explanation of why.
- When calling the functions, only use parameters included in their definitions. Use \`${configForRuntime.awaitKeyword.trim() || 'await'}\` only if the function is asynchronous.
- Do not import external modules or use any libraries.
- Do not catch errors — let exceptions propagate.
- If the output format is unspecified, return the result in JSON and write it to stdout.
- Never output anything else to stdout — include any messages inside the resulting JSON.
- Do not include any comments or documentation — only code is needed.
- You may transform or summarize results from the provided functions if needed.

${configForRuntime.outputInstruction}
`;

const adhocVariant = `
- You must define **two** functions:
  - \`doTask\`: a reusable function that must take explicit parameters for all needed inputs. It must end by logging the final result using:
    \`${configForRuntime.logFunction}\`
  - \`doAdhocTask\`: a wrapper function that defines constants for the required inputs and passes them as arguments to \`doTask\`.
- \`doTask\` must not define any constants inside its body. All inputs must be received via parameters to support reuse.
- \`doAdhocTask\` must take no parameters, must call \`doTask\` with the appropriate arguments, and must **not log or output** anything itself.
- Do not write or create any files.
- Use only the functions described above and built-in ${runtimeName} features.
- Output both functions in a single code block, and nothing else.

Example structure:
${configForRuntime.adhocExample}`;

const compileVariant = `
- You must define a single function: \`doTask\`.
- It must be fully parameterized with all required inputs.
- It must end by logging the final result using:
  \`${configForRuntime.logFunction}\`
- Use only the functions described above and built-in ${runtimeName} features.
- Do not write or create any files.
- Do not include example calls — output only the function in a single code block.
`;

export function generateAnsweringFunctionPrompt(instructions, functionsSignatures, adHoc = false) {
  const formattedFunctions = Object.entries(functionsSignatures)
    .map(([_, signature]) => `- ${signature}\n`)
    .join('');

  let prompt = basePrompt.replace('{{functionsSignatures}}', formattedFunctions);

  prompt += adHoc ? adhocVariant : compileVariant;

  if (instructions) {
    prompt += `\n# TASK CODE GENERATION INSTRUCTIONS AND ADDITIONAL INFORMATION:\n${instructions}`;
  }

  return prompt;
}
