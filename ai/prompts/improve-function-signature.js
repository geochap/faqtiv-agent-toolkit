export function improveFunctionSignaturePrompt(functionCode, signature) {
  const prompt = `
Given this function file contents:

\`\`\`
${functionCode}
\`\`\`

And this function signature that was generated from this function:

\`\`\`
${signature}
\`\`\`

These signatures have the following components: function_name(parameters) : return_type - description

Improve the existing signature or add missing ones for this function applying the following criteria:

- The function may include code docs, use all the information you can from there.
- If there is no code doc, fill in the signature components as best as you can.
- If you have to fill in a function's description keep as short as possible without leaving out any important details including some details about the return type, the description must not exceed 1000 characters.
- If you have to fill in parameters make sure that you include the type for each (e.g. param:number).
- return_type must describe the return type as thoroughly as possible so to the best of your abilities infer the types from function code, for example "array" or "object" are not acceptable types unless their items or content properties are described.
- If the function returns an array or list of objects or dicts, you MUST specify ALL of the properties of the returned objects either in the return type or the description. List all properties. Do not list some and say etc.
- These signatures will be later used for code generation so keep that in mind when filling in any missing signature components, all relevant information for proper function usage is needed.
- Reply back with the signature without any other additional text, leave out the function and annotations.
- The signatures must be plain text with the following structure: function_name(parameters) : return_type - description
`;

  return prompt;
}