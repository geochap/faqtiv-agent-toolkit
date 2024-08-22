import { generateAnsweringFunctionPrompt } from '../ai/prompts/generate-answering-function.js';
import * as config from '../config.js';
import { getAllFiles } from '../lib/file-utils.js';
import { extractFunctionCode } from '../lib/parse-utils.js';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const { runtimeName, codeFileExtension } = config.project.runtime;
const { codeDir, metadataDir, tasksDir } = config.project;

function agentTemplate(imports, functions, libs, tasks, taskNameMap, tool_schemas, instructions, signatures, examples) {
  return `import os
import requests
import argparse
from typing import List, Dict, Union, Any, Optional
from pydantic import create_model
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

# Tool schemas
tool_schemas = ${tool_schemas}

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

# Clean up embeddings
# TODO: this is a hack to fix the issue of embeddings being too short, find why embeddings are invalid for some examples
maxlen = max(len(e) for e in embeddings_list)
clean_embeddings = []
clean_texts = []
clean_metadatas = []

for i, embedding in enumerate(embeddings_list):
    if len(embedding) == maxlen:
        clean_embeddings.append(embedding)
        clean_texts.append(texts[i])
        clean_metadatas.append(metadatas[i])

# Convert list of numpy arrays to 2D numpy array
embeddings_array = np.array(clean_embeddings)

vector_store = FAISS.from_embeddings(
    text_embeddings=list(zip(clean_texts, embeddings_array)),
    embedding=embeddings,
    metadatas=clean_metadatas
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
def create_tools_from_schemas(schemas: Dict[str, Dict[str, Any]]) -> List[StructuredTool]:
    tools = []
    for name, schema in schemas.items():
        tool = StructuredTool(
            name=name,
            description=schema["description"],
            args_schema=schema["args_schema"],
            func=schema["function"],
            metadata={"output": schema["output"]}
        )
        tools.append(tool)
    return tools

# Create tools from schemas
tools = create_tools_from_schemas(tool_schemas)

promptText = """
${generateAnsweringFunctionPrompt(instructions, signatures, true)}
- Wrap the single doTask function in a python code block
"""

promptText = promptText.replace("{", "{{").replace("}", "}}") # escape curly braces to avoid template errors

prompt = ChatPromptTemplate.from_messages(
    [
        ("system", promptText),
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

# Read the API key and model from environment variables
api_key = os.getenv('OPENAI_API_KEY')
model = os.getenv('OPENAI_MODEL')

# Initialize OpenAI LLM
llm = ChatOpenAI(model=model)

# Define the agent
agent = create_tool_calling_agent(llm, tools, prompt)

# Create the agent executor
agent_executor = AgentExecutor(agent=agent, tools=tools)


# http agent
from langchain.callbacks.streaming_stdout import StreamingStdOutCallbackHandler
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import asyncio
import io
import json
from contextlib import redirect_stdout

app = FastAPI()

async def capture_and_process_output(func, *args, **kwargs):
    f = io.StringIO()
    with redirect_stdout(f):
        result = await func(*args, **kwargs) if asyncio.iscoroutinefunction(func) else func(*args, **kwargs)
    
    output = f.getvalue()
    
    try:
        processed_result = json.loads(output)
    except json.JSONDecodeError:
        processed_result = output.strip()
    
    return processed_result

@app.post("/run_adhoc")
async def run_adhoc_endpoint(request: Request):
    data = await request.json()
    user_input = data["input"]
    max_retries = 3
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
                    ("system", promptText),
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
            return JSONResponse(content={"result": result})

        except Exception as e:
            error_message = str(e)
            print(f"Error during execution (attempt {retry_count + 1}): {error_message}")
            errors.append(error_message)
            retry_count += 1

            if retry_count > max_retries:
                print(f"Max retries ({max_retries}) reached. Aborting.")
                return JSONResponse(content={"error": f"Max retries reached. Last error: {error_message}"}, status_code=500)

            print(f"Retrying... (attempt {retry_count} of {max_retries})")

    # This line should never be reached, but just in case
    return JSONResponse(content={"error": "Unexpected error occurred"}, status_code=500)

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

class HttpStreamingHandler(StreamingStdOutCallbackHandler):
    def __init__(self):
        self.queue = asyncio.Queue()
        super().__init__()
    
    async def on_llm_new_token(self, token: str, **kwargs) -> None:
        await self.queue.put(token.encode('utf-8'))

    async def get_tokens(self):
        while True:
            try:
                yield await self.queue.get()
            except asyncio.CancelledError:
                break

# Cli agent
class CliStreamingHandler(StreamingStdOutCallbackHandler):
    def __init__(self):
        self.text = ""
        super().__init__()

    def on_llm_new_token(self, token: str, **kwargs) -> None:
        self.text += token
        print(token, end="", flush=True)

def cliAgent():
    print("Welcome, please type your request. Type 'exit' to quit.")
    chat_history = []
    streaming_handler = CliStreamingHandler()

    while True:
        user_input = input("\\nYou: ")
        
        if user_input.lower() == 'exit':
            print("Goodbye!")
            break

        print("\\nAgent: ", end="", flush=True)
        result = agent_executor.invoke(
            {
                "input": user_input,
                "chat_history": chat_history
            },
            {"callbacks": [streaming_handler]}
        )
        print()  # Add a newline after the streamed response

        # Update chat history with correct message types
        chat_history.append({"role": "user", "content": user_input})
        chat_history.append({"role": "assistant", "content": streaming_handler.text})

        # Reset the streaming handler text
        streaming_handler.text = ""


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

  taskFiles.forEach(file => {
    const code = fs.readFileSync(file.fullPath, 'utf8');
    const taskName = path.basename(file.fullPath, codeFileExtension);
    const doTaskCode = extractFunctionCode(code, 'doTask');
    if (doTaskCode) {
      // Convert task name to a valid Python function name
      const validPythonName = taskName.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_');
      taskFunctions.push(doTaskCode.replace('def doTask', `def ${validPythonName}`));
      taskNameMap[taskName] = validPythonName;
    }
  });

  return { taskFunctions, taskNameMap };
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

export default async function exportStandalone() {
  const { instructions, libs, functions, functionsHeader } = config.project;

  if (runtimeName !== 'python') {
    console.log('Standalone export is only supported for Python.');
    return;
  }

  const tool_schemas = functionsHeader.function_tool_schemas;
  const functionsCode = functions.map(f => f.code);
  const libsCode = libs.map(l => l.code);
  const imports = [...new Set(libs.concat(functions).flatMap(f => f.imports))];
  const { taskFunctions, taskNameMap } = getTaskFunctions();
  const examples = getExamples();

  const agentCode = agentTemplate(
    imports, 
    functionsCode, 
    libsCode, 
    taskFunctions,
    taskNameMap,
    tool_schemas, 
    instructions, 
    functionsHeader.signatures, 
    examples
  );

//   console.log('exporting standalone agent...');
//   console.log('Warning: tasks will use the latest version of the functions and libs, migrate outdated tasks to avoid unexpected errors.');
  console.log(agentCode);
}