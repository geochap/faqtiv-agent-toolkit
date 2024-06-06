export function improveFunctionSignaturesPrompt(functions, signatures) {
  const prompt = `
Given these function file contents:

\`\`\`
${functions.join('\n\n')}
\`\`\`

And these function signatures that where generated from these functions:

\`\`\`
${signatures.join('\n')}
\`\`\`

These signatures have the following components: function_name(parameters) : return_type - description

Improve the existing signatures or add missing ones for all functions applying the following criteria:

1. Each function file may include a jsDoc annotation, use all the information you can from there.
2. For any function information that is not included in the jsDoc annotation fill in the signature components as best as you can.
3. If you have to fill a function's description keep as short as possible without leaving out any important details.
4. If you have to fill in parameters make sure that you include the type for each (e.g. param:number).
5. These signatures will be later used for code generation so keep that in mind when filling in any missing signature components, all relevant information for proper function usage is needed.
6. Reply back with the list of signatures without any other additional text, leave out the functions and annotations.
`;

  return prompt;
}