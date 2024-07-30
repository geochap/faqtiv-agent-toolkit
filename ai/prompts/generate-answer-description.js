export function generateAnswerDescriptionPrompt(taskName, code) {
  console.log(taskName)
  const prompt = `
Given the doTask function in the following code, generate a function schema compatible with OpenAI function tool schema applying the instructions below.

### CODE ###
\`\`\`
${code}
\`\`\`

### INSTRUCTIONS ###

Generate the signature for this function applying the following criteria:

- Fill in the signature components as best as you can based on the doTask and its function dependencies.
- For the name you must use ${taskName}
- For the function description keep as short as possible without leaving out any important details, do not mention stdout or console.
- Include a returns property in the style of a TypeScript type definition that must describe the return type as thoroughly as possible so to the best of your abilities infer the types from the code, for example "array" or "object" are not acceptable types unless their items or content properties are defined.
- Reply back with the JSON schema as-is without any additional text or codeblock tags, leave out the code and functions.

This is an example of a valid schema:
{
    "schema": {
        "user_id": {
            "type": "string",
            "description": "The user id to filter search items"
        }
    },
    "name": "getItems",
    "description": "Retrieves a list of items for a given user",
    "returns": "{ id: string; name: string; }[]",
    "requiredParams": [
        "user_id"
    ]
}
`;

  return prompt;
}