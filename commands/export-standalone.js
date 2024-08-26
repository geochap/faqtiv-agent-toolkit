import { generateAnsweringFunctionPrompt } from '../ai/prompts/generate-answering-function.js';
import * as config from '../config.js';
import { getAllFiles } from '../lib/file-utils.js';
import { extractFunctionCode } from '../lib/parse-utils.js';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const { runtimeName, codeFileExtension } = config.project.runtime;
const { codeDir, metadataDir, tasksDir } = config.project;

const completionPrompt = `You are a helpful bot assistant that runs tasks based on the user prompt

MAIN GUIDELINES

- Apply your best judgment to decide which tasks to run, if one or more tasks look like they do the same pick a single one
- To answer questions give preference to tasks that don't generate files unless the user specifically asks for them
- If the task response includes file paths append them to the end of your response as described in the json block instructions below
- For math formulas use syntax supported by KaTex and use $$ as delimiter
- If the user doesn't explicitly ask for a file, asume the data should be rendered with markdown in the response itself
- Always use markdown to format your response, prefer tables and text formatting over code blocks unless its code
- Be strict about the accuracy of your responses, do not offer alternative data or use incorrect information
- Avoid making assumptions or providing speculative answers, when in doubt ask for clarification

CRITERIA FOR USING TOOLS

- If none of the existing tools help you fulfill the request, use the run-ad-hoc-task tool to fulfill the request
- When using run-ad-hoc-task, make your best guess to select the most suitable agent based on its description and tools
- If the run-ad-hoc-task result doesn't fully address the user's request or seems incorrect, try using run-ad-hoc-task again with a refined task description (more details below)
- Only after exhausting all possibilities with run-ad-hoc-task, if you still cannot provide accurate information, reply with a friendly error message explaining that you don't have the necessary information or capabilities to answer the question

AGENT TOOLS INSTRUCTIONS

- The function tools you have available belong to an agent
- The following is the agent's instructions and domain information that will help you understand how to use the data its functions return

AD-HOC TASK INSTRUCTIONS
- Try your best to use existing tools but if there aren't any that can be used to fulfill the user's request then call the adhoc tool to achieve what you need to do, select the most suitable agent based on its description and existing tools
- Look suspiciously at results that are not what you expect: adhoc generates and runs new code and the results could be wrong, apply your best judgment to determine if the result looks correct or not
    - For example: it returned an array with only invalid or missing data like nulls or empty strings
- If the results do not look correct try to fix them by using the adhoc tool again with an updated description of the task

AGENT DOMAIN INFORMATION

AGENT INSTRUCTIONS
This is an agent specialized in retrieving bank data from the FDIC API`


function agentTemplate(imports, functions, libs, tasks, taskNameMap, taskToolSchemas, adhocToolSchemas, instructions, signatures, examples) {
  return `import os
import requests
import argparse
from typing import List, Dict, Union, Any, Optional
from pydantic import BaseModel, Field, create_model
from langchain_core.tools import StructuredTool
from langchain_core.prompts import ChatPromptTemplate, FewShotChatMessagePromptTemplate
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
from openai import OpenAI
import asyncio
import io
import json
from contextlib import redirect_stdout
import base64
import numpy as np
import time
import uuid
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from langchain.callbacks import AsyncIteratorCallbackHandler
from functools import partial

EXPECTED_EMBEDDING_DIMENSION = 1536

# Agent lib and functions dependencies
${imports.join('\n')}

# Agent libs
${libs.join('\n')}

# Agent functions
${functions.join('\n')}

# Task name mapping
task_name_map = ${JSON.stringify(taskNameMap, null, 2)}

# Agent tasks
${tasks.join('\n\n')}

# Task tool schemas
task_tool_schemas = {
${taskToolSchemas.join(',\n')}
}

# Adhoc tool schemas
tool_schemas = ${adhocToolSchemas}

# Examples with pre-computed embeddings
examples_with_embeddings = ${JSON.stringify(examples, null, 2)}

# Initialize embeddings
embeddings = OpenAIEmbeddings()

def decode_base64_embedding(b64_string):
    decoded_bytes = base64.b64decode(b64_string)
    embedding = np.frombuffer(decoded_bytes, dtype=np.float32)
    
    if len(embedding) != EXPECTED_EMBEDDING_DIMENSION:
        print(f"Warning: Decoded embedding has unexpected dimension: {len(embedding)}. Adjusting to {EXPECTED_EMBEDDING_DIMENSION}.")
        return adjust_embedding_dimension(embedding)
    
    return embedding

def adjust_embedding_dimension(embedding, target_dim=EXPECTED_EMBEDDING_DIMENSION):
    if len(embedding) < target_dim:
        return np.pad(embedding, (0, target_dim - len(embedding)), 'constant')
    elif len(embedding) > target_dim:
        return embedding[:target_dim]
    return embedding

# Create vector store from pre-computed embeddings
texts = [json.dumps({**example['document'], 'embedding': None}) for example in examples_with_embeddings]
embeddings_list = [decode_base64_embedding(example['taskEmbedding']) for example in examples_with_embeddings]
metadatas = [{}] * len(examples_with_embeddings)

# Convert list of numpy arrays to 2D numpy array
embeddings_array = np.array(embeddings_list)

vector_store = FAISS.from_embeddings(
    text_embeddings=list(zip(texts, embeddings_list)),
    embedding=embeddings,
    metadatas=metadatas
)

# Initialize OpenAI client
client = OpenAI()

def get_embedding(text, model="text-embedding-ada-002"):
    text = text.replace("\\n", " ")
    return client.embeddings.create(input = [text], model=model).data[0].embedding

def get_relevant_examples(query: str, k: int = 10) -> List[Dict]:
    # Generate embedding for the query using the same model as stored embeddings
    query_embedding = get_embedding(query)
    
    # Ensure the query embedding has the correct dimension
    if len(query_embedding) != EXPECTED_EMBEDDING_DIMENSION:
        print(f"Warning: Query embedding dimension ({len(query_embedding)}) does not match expected dimension ({EXPECTED_EMBEDDING_DIMENSION})")
        query_embedding = adjust_embedding_dimension(query_embedding)
 
    # Perform vector search
    results = vector_store.similarity_search_by_vector(query_embedding, k=k)

    relevant_examples = []
    for doc in results:
        example = json.loads(doc.page_content)
        relevant_examples.append({
            "task": example["task"],
            "code": example["code"]
        })
    
    return relevant_examples

# Create tool instances based on schema
async def tool_wrapper(func, *args, **kwargs):
    return await capture_and_process_output(func, *args, **kwargs)

def create_tools_from_schemas(schemas: Dict[str, Dict[str, Any]]) -> List[StructuredTool]:
    tools = []
    for name, schema in schemas.items():
        description = schema["description"]
        if "returns_description" in schema:
            description += f" Returns: {schema['returns_description']}"
        
        if name == "run_adhoc_task":
            func = schema["function"]
        else:
            func = partial(tool_wrapper, schema["function"])
        
        tool = StructuredTool(
            name=name,
            description=description,
            args_schema=schema["args_schema"],
            coroutine=func,
            metadata={"output": schema["output"]}
        )
        tools.append(tool)
    return tools

# Create tools from schemas
task_tools = create_tools_from_schemas(task_tool_schemas)

adhoc_promptText = """
${generateAnsweringFunctionPrompt(instructions, signatures, true)}
- Wrap the single doTask function in a python code block
"""

adhoc_promptText = adhoc_promptText.replace("{", "{{").replace("}", "}}") # escape curly braces to avoid template errors

adhoc_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", adhoc_promptText),
        ("placeholder", "{chat_history}"),
        ("human", "{input}"),
        ("placeholder", "{agent_scratchpad}"),
    ]
)
example_prompt = ChatPromptTemplate.from_messages(
    [
        ("human", "{task}"),
        ("ai", "{code}"),
    ]
)

completion_promptText = """${completionPrompt}"""

completion_prompt = ChatPromptTemplate.from_messages(
    [
        ("system", completion_promptText),
        ("placeholder", "{chat_history}"),
        ("human", "{input}"),
        ("placeholder", "{agent_scratchpad}"),
    ]
)

# Read the API key and model from environment variables
api_key = os.getenv('OPENAI_API_KEY')
model = os.getenv('OPENAI_MODEL')

# Initialize OpenAI LLM
llm = ChatOpenAI(model=model)

# http agent

app = FastAPI()

async def capture_and_process_output(func, *args, **kwargs):
    f = io.StringIO()
    with redirect_stdout(f):
        await func(*args, **kwargs) if asyncio.iscoroutinefunction(func) else func(*args, **kwargs)
    
    output = f.getvalue()
    
    try:
        processed_result = json.loads(output)
    except json.JSONDecodeError:
        processed_result = output.strip()
    
    return processed_result

def extract_function_code(response):
    # Extract the code block from the response
    start = response.find("\`\`\`python")
    end = response.find("\`\`\`", start + 1)
    if start != -1 and end != -1:
        return response[start+9:end].strip()
    return None

async def execute_generated_function(function_code):
    # Create a temporary module to execute the function
    import types
    module = types.ModuleType("temp_module")
    
    # Add necessary imports to the module
    module.__dict__.update(globals())
    
    # Execute the function code in the module's context
    exec(function_code, module.__dict__)
    
    # Call the doTask function
    result = module.doTask()
    
    # If the result is a coroutine, await it
    if asyncio.iscoroutine(result):
        result = await result
    
    return result

async def generate_and_execute_adhoc(user_input: str, max_retries: int = 3):
    retry_count = 0
    errors = []
    previous_code = None

    # Get relevant examples
    relevant_examples = get_relevant_examples(user_input)
    few_shot_prompt = FewShotChatMessagePromptTemplate(
        example_prompt=example_prompt,
        examples=relevant_examples,
    )

    while retry_count <= max_retries:
        try:
            # Prepare the prompt with error information if available
            error_context = ""
            if errors:
                error_context = f"Previous attempt failed with error: {errors[-1]}\\n"
                if previous_code:
                    error_context += f"Previous code:\\n{previous_code}\\n"
                error_context += "Please fix the issue and try again.\\n"

            current_prompt = ChatPromptTemplate.from_messages(
                [
                    ("system", adhoc_promptText),
                    ("placeholder", "{chat_history}"),
                    few_shot_prompt,
                    ("human", "{input}"),
                    ("placeholder", "{agent_scratchpad}"),
                ]
            )
            formatted_prompt = current_prompt.format(
                input=f"{error_context}{user_input}",
                chat_history=[],
                agent_scratchpad=[],
            )
            
            response = await llm.ainvoke(formatted_prompt)
            function_code = extract_function_code(response.content)
            
            if not function_code:
                raise ValueError("Failed to generate function code")
            if function_code:
                previous_code = function_code
            
            result = await capture_and_process_output(execute_generated_function, function_code)
            return result

        except Exception as e:
            error_message = str(e)
            print(f"Error during execution (attempt {retry_count + 1}): {error_message}")
            errors.append(error_message)
            retry_count += 1

            if retry_count > max_retries:
                print(f"Max retries ({max_retries}) reached. Aborting.")
                raise ValueError(f"Max retries reached. Last error: {error_message}")

            print(f"Retrying... (attempt {retry_count} of {max_retries})")

    # This line should never be reached, but just in case
    raise ValueError("Unexpected error occurred")

@app.post("/run_adhoc")
async def run_adhoc_endpoint(request: Request):
    data = await request.json()
    user_input = data["input"]
    
    try:
        result = await generate_and_execute_adhoc(user_input)
        return JSONResponse(content={"result": result})
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

@app.post("/run_task/{task_name}")
async def run_task_endpoint(task_name: str, request: Request):
    data = await request.json()
    args = data.get("args", {})
    
    valid_task_name = task_name_map.get(task_name, task_name)
    
    if valid_task_name not in globals():
        return {"error": f"Task '{task_name}' not found"}
    
    task_function = globals()[valid_task_name]

    try:
        result = await capture_and_process_output(task_function, **args)
        return {"result": result}
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)

class Message(BaseModel):
    role: str
    content: str

class CompletionRequest(BaseModel):
    messages: List[Message]
    max_tokens: Optional[int] = Field(default=1000, ge=1, le=4096)
    temperature: Optional[float] = Field(default=0.7, ge=0, le=2)
    stream: Optional[bool] = False

class CompletionResponse(BaseModel):
    id: str
    object: str
    created: int
    model: str
    choices: List[dict]


async def run_adhoc_task(description: str) -> str:
    try:
        result = await generate_and_execute_adhoc(description)
        # Ensure the result is a string
        if isinstance(result, dict):
            result = json.dumps(result)
        elif not isinstance(result, str):
            result = str(result)
        return result
    except Exception as e:
        return f"Error during execution: {str(e)}"
    
completion_tool_schemas = {
    "run_adhoc_task": {
        "description": "A tool for an agent to run custom tasks described in natural language",
        "input": {"description": str},
        "args_schema": create_model(
            "runAdhocTask",
            description=(str, ...) 
        ),
        "output": Any,
        "function": run_adhoc_task
    }
}

adhoc_tool = create_tools_from_schemas(completion_tool_schemas)

# Create an agent for the completion endpoint using the adhoc tool
completion_tools = adhoc_tool + task_tools
completion_agent = create_tool_calling_agent(llm, completion_tools, completion_prompt)
completion_executor = AgentExecutor(agent=completion_agent, tools=completion_tools)

@app.post("/completions")
async def completions_endpoint(request: CompletionRequest):
    try:
        if request.stream:
            return StreamingResponse(stream_completion(request), media_type="text/event-stream")
        else:
            return await generate_completion(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def generate_completion(request: CompletionRequest):
    current_time = int(time.time())
    completion_id = f"cmpl-{uuid.uuid4()}"

    # Prepare the conversation history
    conversation = [{"role": msg.role, "content": msg.content} for msg in request.messages]
    
    # Use the completion executor to process the request
    result = await completion_executor.ainvoke(
        {
            "input": conversation[-1]["content"],
            "chat_history": conversation[:-1]
        }
    )

    completion_response = CompletionResponse(
        id=completion_id,
        object="chat.completion",
        created=current_time,
        model=model,
        choices=[
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": result["output"]
                },
                "finish_reason": "stop"
            }
        ]
    )
    
    return JSONResponse(content=completion_response.dict())

async def stream_completion(request: CompletionRequest):
    current_time = int(time.time())
    completion_id = f"cmpl-{uuid.uuid4()}"

    # Prepare the conversation history
    conversation = [{"role": msg.role, "content": msg.content} for msg in request.messages]
    
    # Use the completion executor to process the request
    async for event in completion_executor.astream(
        {
            "input": conversation[-1]["content"],
            "chat_history": conversation[:-1]
        }
    ):
        if "output" in event:
            yield f"data: {json.dumps({'id': completion_id, 'object': 'chat.completion.chunk', 'created': current_time, 'model': request.model, 'choices': [{'index': 0, 'delta': {'role': 'assistant', 'content': event['output']}, 'finish_reason': None}]})}\\n\\n"

    yield f"data: {json.dumps({'id': completion_id, 'object': 'chat.completion.chunk', 'created': current_time, 'model': request.model, 'choices': [{'index': 0, 'delta': {}, 'finish_reason': 'stop'}]})}\\n\\n"
    yield "data: [DONE]\\n\\n"

# Cli agent
class CliStreamingHandler(AsyncIteratorCallbackHandler):
    def __init__(self):
        super().__init__()
        self.tokens = []

    async def on_llm_new_token(self, token: str, **kwargs) -> None:
        self.tokens.append(token)
        print(token, end="", flush=True)

async def async_cliAgent():
    print("Welcome, please type your request. Type 'exit' to quit.")
    chat_history = []
    streaming_handler = CliStreamingHandler()

    while True:
        user_input = input("\\nYou: ")
        
        if user_input.lower() == 'exit':
            print("Goodbye!")
            break

        print("\\nAgent: ", end="", flush=True)
        
        task = asyncio.create_task(
            completion_executor.ainvoke(
                {
                    "input": user_input,
                    "chat_history": chat_history
                },
                {"callbacks": [streaming_handler]}
            )
        )

        async for _ in streaming_handler.aiter():
            pass  # We're printing in the callback, so just wait for it to finish here

        await task
        print()  # Add a newline after the streamed response

        # Update chat history
        chat_history.append({"role": "user", "content": user_input})
        chat_history.append({"role": "assistant", "content": "".join(streaming_handler.tokens)})

        # Clear tokens for next iteration
        streaming_handler.tokens.clear()

def cliAgent():
    asyncio.run(async_cliAgent())

if __name__ == "__main__":    
    parser = argparse.ArgumentParser(description="FAQtiv Agent CLI/HTTP Server")
    parser.add_argument("--http", action="store_true", help="Run as HTTP server")
    args = parser.parse_args()

    if args.http:
        import uvicorn
        print("Starting HTTP server...")
        uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
    else:
        cliAgent()
`
}

function getTaskFunctions() {
  // Get all task files
  const taskFiles = getAllFiles(codeDir, codeFileExtension);

  // Extract task functions from task files
  const taskFunctions = [];
  const taskNameMap = {};
  const taskToolSchemas = [];

  taskFiles.forEach(file => {
    const code = fs.readFileSync(file.fullPath, 'utf8');
    const taskName = path.basename(file.fullPath, codeFileExtension);
    const doTaskCode = extractFunctionCode(code, 'doTask');
    if (doTaskCode) {
      // Convert task name to a valid Python function name
      const validPythonName = taskName.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_');
      taskFunctions.push(doTaskCode.replace('def doTask', `def ${validPythonName}`));
      taskNameMap[taskName] = validPythonName;

      // Get and update the task schema
      const metadataPath = path.join(metadataDir, `${taskName}.yml`);
      if (fs.existsSync(metadataPath)) {
        const metadata = yaml.load(fs.readFileSync(metadataPath, 'utf8'));
        if (metadata.output && metadata.output.task_schema) {
          let schemaString = metadata.output.task_schema;
          const taskNameRegex = new RegExp(taskName, 'g');
          schemaString = schemaString.replace(taskNameRegex, validPythonName);
          schemaString = schemaString.replace(/doTask/g, validPythonName);
          taskToolSchemas.push(schemaString);
        }
      }
    }
  });

  return { taskFunctions, taskNameMap, taskToolSchemas };
}

function getExamples() {
  const examples = [];
  const exampleNames = config.project.taskExamples;

  for (const name of exampleNames) {
    const ymlFilePath = path.join(metadataDir, `${name}.yml`);
    const txtFilePath = path.join(tasksDir, `${name}.txt`);
    const jsFilePath = path.join(codeDir, `${name}${codeFileExtension}`);

    if (!fs.existsSync(ymlFilePath) || !fs.existsSync(txtFilePath) || !fs.existsSync(jsFilePath)) {
    console.warn(`Skipping example "${name}" due to missing files.`);
    continue;
    }

    const yamlContent = yaml.load(fs.readFileSync(ymlFilePath, 'utf8'));
    const taskText = fs.readFileSync(txtFilePath, 'utf8');
    const jsFileContent = fs.readFileSync(jsFilePath, 'utf8');
    const doTaskCodeString = extractFunctionCode(jsFileContent, 'doTask');

    examples.push({
    taskEmbedding: yamlContent.embedding,
    functionsEmbedding: yamlContent.functions_embedding,
    document: {
        id: yamlContent.id,
        task: taskText,
        code: doTaskCodeString
    }
    });
  }

  return examples;
}

export default async function exportStandalone(outputDir = process.cwd()) {
  const { instructions, libs, functions, functionsHeader } = config.project;

  if (runtimeName !== 'python') {
    console.log('Standalone export is only supported for Python.');
    return;
  }

  const adhocToolSchemas = functionsHeader.function_tool_schemas;
  const functionsCode = functions.map(f => f.code);
  const libsCode = libs.map(l => l.code);
  const imports = [...new Set(libs.concat(functions).flatMap(f => f.imports))];
  const { taskFunctions, taskNameMap, taskToolSchemas } = getTaskFunctions();
  const examples = getExamples();

  const agentCode = agentTemplate(
    imports, 
    functionsCode, 
    libsCode, 
    taskFunctions,
    taskNameMap,
    taskToolSchemas,
    adhocToolSchemas, 
    instructions, 
    functionsHeader.signatures, 
    examples
  );

  fs.writeFileSync(path.join(outputDir, 'agent.py'), agentCode);

  // Generate requirements.txt
  const requirements = [
    'faiss-cpu==1.8.0.post1',
    'fastapi==0.112.0',
    'langchain==0.2.12',
    'langchain-community==0.2.11',
    'langchain-core==0.2.28',
    'langchain-openai==0.1.20',
    'langchain-text-splitters==0.2.2',
    'numpy==1.26.4',
    'openai==1.38.0',
    'pydantic==2.8.2',
    'pydantic_core==2.20.1',
    'requests==2.32.3',
    'uvicorn==0.30.5'
  ];
  fs.writeFileSync(path.join(outputDir, 'requirements.txt'), requirements.join('\n'));

  // Generate README.md
  const readmeContent = `# Standalone FAQtiv Agent

This is a standalone version of a FAQtiv agent. It includes all the necessary components to run the agent independently.

## Setup

1. Ensure you have Python 3.7+ installed.
2. Install the required dependencies:

   \`\`\`
   pip install -r requirements.txt
   \`\`\`

3. Set up your OpenAI API and model as environment variables:

   \`\`\`
   export OPENAI_API_KEY=your_api_key_here
   export OPENAI_MODEL=gpt-4o
   \`\`\`

## Running the Agent

You can run the agent in two modes:

### Interactive CLI Mode

To start the agent in interactive CLI mode, run:

\`\`\`
python agent.py
\`\`\`

You can then interact with the agent by typing your requests. Type 'exit' to quit.

### HTTP Server Mode

To start the agent as an HTTP server, run:

\`\`\`
python agent.py --http
\`\`\`

By default, the server will run on \`http://localhost:8000\`. You can interact with it using the following endpoints:

1. \`/run_task/{taskName}\`: Runs a specific task.
   - Method: POST
   - Body: JSON object with \`args\` (optional), \`output\` (optional), \`files\` (optional), and \`error\` (optional).

2. \`/run_adhoc\`: Runs an ad-hoc task based on an input.
   - Method: POST
   - Body: JSON object with \`input\`.

3. \`/completions\`: Provides a chat-like interface for interacting with the agent.
   - Method: POST
   - Body: JSON object with \`messages\`, \`max_tokens\` (optional), \`temperature\` (optional), and \`stream\` (optional).

For more detailed information on how to use these endpoints, refer to the original FAQtiv Agent Toolkit documentation.

## Note

This standalone agent is a static export and does not have the ability to compile new tasks or modify existing ones. It represents the agent's state at the time of export.
`;

  fs.writeFileSync(path.join(outputDir, 'README.md'), readmeContent);

  console.log(`Standalone agent exported to ${outputDir}`);
  console.log('Generated files:');
  console.log('- agent.py');
  console.log('- requirements.txt');
  console.log('- README.md');
}