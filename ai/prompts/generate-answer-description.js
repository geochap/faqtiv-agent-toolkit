export function generateAnswerDescriptionPrompt() {
  const prompt = `
Given the doTask function you last generated, generate a function signature.

The signature has the following components: (parameters) : return_type - description

Generate the signature for this function applying the following criteria:

- Fill in the signature components as best as you can based on the doTask and its function dependencies.
- For the function description keep as short as possible without leaving out any important details, do not mention stdout or console.
- For the function parameters make sure that you include the type for each (e.g. param:number).
- For the function return_type generate a signature of the JSON that doTask outputs to stdout.
- return_type must describe the return type as thoroughly as possible so to the best of your abilities infer the types from the code, for example "array" or "object" are not acceptable types unless their items or content properties are described.
- Regardless of the function programming language generate types that are compilant with JSDoc.
- These signatures will be later used for code generation so keep that in mind when filling in signature components, all relevant information for proper function usage is needed.
- Reply back with the signature as-is without any additional text or codeblock tags, leave out the code and functions.
`;

  return prompt;
}