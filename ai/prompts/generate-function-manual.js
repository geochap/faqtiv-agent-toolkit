export function generateFunctionManualPrompt(functionCode, documentsHeader) {
  const formattedDocuments = Object.entries(documentsHeader)
    .map(([key, value]) => `- ${key}: ${value.description}\n`)
    .join('\n');

  let documentsSection = '';

  if (Object.keys(documentsHeader).length > 0) {
    documentsSection = `
And these documents:

\`\`\`
${formattedDocuments}
\`\`\`

Use tool get_document to get more information for the documents that you consider relevant to document the function, only call for documents included in the list above.`;
  }

  const prompt = `
Given this function:

\`\`\`
${functionCode}
\`\`\`
${documentsSection}

Using only these functions execute the following instructions:

In a codeblock at the top of your response write a markdown formatted manual that fulfills the given requirements:

- Must be written in markdown format
- Include all the information needed to understand and use the function but leave out any implementation details and code
- Give special attention to the function's inputs and outputs, describe them in detail
- If there are no documents that are relevant to the function, write a manual that describes the function and its purpose
- Do not wrap the markdown in a codeblock
`;

  return prompt;
}