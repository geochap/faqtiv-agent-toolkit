export function generateDocSummaryPrompt(name, content) {
  const prompt = `Generate a brief, clear description for the following documentation file. 
Provide a short summary that captures its main purpose and content needed to understand it.

Filename: ${name}
Content: 
\`\`\`
${content}
\`\`\`

Provide only the description as a single line of text.
`;

  return prompt;
}