const basePrompt = `
Given this function:

\`\`\`
{{functionCode}}
\`\`\`

And these documents:

\`\`\`
{{documentsHeader}}
\`\`\`

Use tool get_document to get more information for the documents that you consider relevant to document the function.

Using only these functions execute the following instructions:

In a codeblock at the top of your response write a markdown formatted manual that fulfills the given requirements:

- Must be written in markdown format
- Include all the information needed to understand and use the function
`;

export function generateFunctionManualPrompt(functionCode, documentsHeader) {
  const formattedDocuments = Object.entries(documentsHeader)
    .map(([key, value]) => `- ${key}: ${value.description}\n`)
    .join('\n');

  let prompt = basePrompt
    .replace('{{functionCode}}', functionCode)
    .replace('{{documentsHeader}}', formattedDocuments);

  return prompt;
}