import * as config from '../../config.js';
const { runtimeName } = config.project.runtime;

export function generateLangchainToolSchemasPrompt(functionSignatures) {
  const prompt = `
Given the following function signatures, generate corresponding tool schemas compatible with langchain function tool schema applying the instructions below.

### SIGNATURES ###

${functionSignatures}


### INSTRUCTIONS ###

Generate a list of langchain tool schemas for this function applying the following criteria:

- Fill in the schema properties as best as you can based on the function signature, make to use valid ${runtimeName} types.
- For the function use the function name.
- Reply back with the schemas as-is without imports, any additional text or codeblock tags, leave out the code and functions.
- In args_schema for any third party types, use the type by providing the correct import
- output should correspond to the function signature return type

This is an example of a valid result:
{
  "function_1": {
    "description": "Fetches a list of items of type 1",
    "input": {"name": str},
    "args_schema": create_model( # Inline Pydantic model for args_schema
      "Function1", 
      name=(str, ...)  # This defines 'name' as a required field of type str
    )
    "output": List[Dict[str, Any]],
    "function": function_1
  },
  "function_2": {
    "description": "Fetches a list of items of type 2",
    "input": {"name": str},
    "args_schema": create_model( # Inline Pydantic model for args_schema
      "Function2", 
      name=(str, "default_value")   # Inline Pydantic model field for name with default value
    )
    "output": List[Dict[str, Any]],
    "function": function_2
  }
}
`;

  return prompt;
}