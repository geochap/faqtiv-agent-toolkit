import * as config from '../../config.js';

export function generateLangchainToolSchemaFromFunctionPrompt(taskName, functionCode, functionName) {
  const prompt = `
  Given the ${functionName} function in the following code, generate a function schema compatible with langchain function tool schema applying the instructions below.

### FUNCTION ###

${functionCode}


### INSTRUCTIONS ###

Generate a langchain tool schema for this function applying the following criteria:

- Fill in the signature components as best as you can based on the doTask and its function dependencies.
- For the tool name use ${taskName}.
- For the function use the function name.
- For the model name use create a model name from the tool name.
- For the function description keep as short as possible without leaving out any important details, do not mention stdout or console.
- Include a returns_description property in the style of a TypeScript type definition that must describe the return type as thoroughly as possible so to the best of your abilities infer the types from the code, for example "array" or "object" are not acceptable types unless their items or content properties are defined.
- Reply back with the schemas as-is: leave out the code and functions, no imports, no additional text or codeblock tags or surrounding braces.
- In args_schema for any third party types, use the type by providing the correct import.
- output should correspond to the json output of the function.

This is an example of a valid result:
"function_1": {
  "description": "Fetches a list of items of type 1",
  "returns_description": "Array<{ KEY_1: string; KEY_2: string; }>",
  "input": {"name": str},
  "args_schema": create_model( # Inline Pydantic model for args_schema
    "Function1", 
    name=(str, ...)  # This defines 'name' as a required field of type str
  )
  "output": List[Dict[str, Any]],
  "function": function_1
}
`;

  return prompt;
}