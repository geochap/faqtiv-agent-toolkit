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

- Each function may include code docs, use all the information you can from there.
- For any function information that is not included in the code doc fill in the signature components as best as you can.
- If you have to fill a function's description keep as short as possible without leaving out any important details including some details about the return type, the description must not exceed 1024 characters.
- If you have to fill in parameters make sure that you include the type for each (e.g. param:number).
- return_type must describe the return type as thoroughly as possible so to the best of your abilities infer the types from function code, for example "array" or "object" are not acceptable types unless their items or content properties are described.
- If a function returns an array or list of objects or dicts, you MUST specify ALL of the properties of the returned objects either in the return type or the description. List all properties. Do not list some and say etc.
- These signatures will be later used for code generation so keep that in mind when filling in any missing signature components, all relevant information for proper function usage is needed.
- Reply back with the list of signatures without any other additional text, leave out the functions and annotations.
- The signatures must be plain text with the following structure: function_name(parameters) : return_type - description
`;

  return prompt;
}