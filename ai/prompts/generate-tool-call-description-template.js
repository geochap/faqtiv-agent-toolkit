export function generateToolCallDescriptionTemplatePrompt(taskSchema) {
  const prompt = `
Given this tool schema:

\`\`\`
${taskSchema}
\`\`\`

Generate a template for a tool call description

- It must be a markdown formatted string.
- Add a placeholder #param_name# for each parameter that will be replaced with the actual parameter value when the tool is used if needed.
- Make the description concise but friendly, leave out technical details. Use any information like description, returns_description, etc from the task schema to make the description more detailed.
- This is not a technical description, it is a natural language description of the tool call that will be used by the user to understand the tool call.
- Do not surround the template with \`\`\`markdown tags.

Example

Given this task schema:

\`\`\`json
{
  "name": "bank-report",
  "description": "Generate a report for a specific bank",
  "returns_description": "Array<{ report_date: string; total_deposits: number; }>, where each object contains the report date and total deposits for the corresponding year",
  "schema": z.object({
    bankName: z.string().describe("The name of the bank for which the report is to be generated"),
    year: z.string().describe("The year for which the report is to be generated")
  })
}
\`\`\`

For this tool call:
\`\`\`json
{
  "arguments": {
    "bankName": "a bank name",
    "year": "2020"
  }
}
\`\`\`

Description template:

Retrieving institution and regulatory info about #bankName# for the year #year#.
`;

  return prompt;
}