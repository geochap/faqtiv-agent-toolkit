import * as config from '../config.js';
import { getAllFiles } from '../lib/file-utils.js';
import { extractFunctionCode } from '../lib/parse-utils.js';
import fs from 'fs';
import path from 'path';

const { runtimeName, codeFileExtension } = config.project.runtime;
const { codeDir } = config.project;

function agentTemplate(imports, functions, libs, tasks, tool_schemas, instructions, desktopInstructions) {
  return `import os
import requests
import argparse
from typing import List, Dict, Union, Any, Optional
from pydantic import create_model
from langchain_core.tools import StructuredTool
from langchain_core.prompts import ChatPromptTemplate
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_openai import ChatOpenAI

# Agent lib and functions dependencies
${imports.join('\n')}

# Agent libs
${libs.join('\n')}

# Agent functions
${functions.join('\n')}

# Agent tasks
${tasks.join('\n')}

# Tool schemas
tool_schemas = ${tool_schemas}

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
You are a technical assistant that answers questions using the available tools.

The following instructions are guidelines for interpreting the tool data and composing responses from them.

${instructions ? 'DATA GUIDELINES\n' + instructions : ''}

${desktopInstructions ? 'USER INTERACTION GUIDELINES\n' + desktopInstructions : ''}
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
from fastapi.responses import StreamingResponse
import asyncio
import io
import json
from contextlib import redirect_stdout

app = FastAPI()

@app.post("/run_adhoc")
async def chat_endpoint(request: Request):
    data = await request.json()
    user_input = data["input"]
    chat_history = data.get("chat_history", [])
    streaming_handler = HttpStreamingHandler()

    async def generate_response():
        task = asyncio.create_task(
            agent_executor.ainvoke(
                {
                    "input": user_input,
                    "chat_history": chat_history
                },
                {"callbacks": [streaming_handler]}
            )
        )
        
        async for chunk in streaming_handler.get_tokens():
            yield chunk

        await task

    return StreamingResponse(generate_response(), media_type="text/plain")

@app.post("/run_task/{task_name}")
async def run_task_endpoint(task_name: str, request: Request):
    data = await request.json()
    args = data.get("args", {})
    
    if task_name not in globals():
        return {"error": f"Task '{task_name}' not found"}
    
    task_function = globals()[task_name]
    
    # Capture the printed output
    f = io.StringIO()
    with redirect_stdout(f):
        task_function(**args)
    
    output = f.getvalue()
    
    # If the output is a JSON string, parse it
    try:
        result = json.loads(output)
    except json.JSONDecodeError:
        result = output.strip()
    
    return {"result": result}

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
  const taskFunctions = taskFiles.map(file => {
    const code = fs.readFileSync(file.fullPath, 'utf8');
    const taskName = path.basename(file.fullPath, codeFileExtension);
    const doTaskCode = extractFunctionCode(code, 'doTask');
    if (doTaskCode) {
      // Convert task name to a valid Python function name
      const validPythonName = taskName.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_');
      return doTaskCode.replace('def doTask', `def ${validPythonName}`);
    }
    return null;
  }).filter(Boolean); // Remove any undefined or empty results

  return taskFunctions;
}

export default async function exportStandalone() {
  const { instructions, libs, functions, functionsHeader, desktopInstructions } = config.project;

  if (runtimeName !== 'python') {
    console.log('Standalone export is only supported for Python.');
    return;
  }

  const tool_schemas = functionsHeader.function_tool_schemas;
  const functionsCode = functions.map(f => f.code);
  const libsCode = libs.map(l => l.code);
  const imports = [...new Set(libs.concat(functions).flatMap(f => f.imports))];
  const taskFunctions = getTaskFunctions();

  const agentCode = agentTemplate(imports, functionsCode, libsCode, taskFunctions, tool_schemas, instructions, desktopInstructions);

  console.log('exporting standalone agent...');
  console.log('Warning: tasks will use the latest version of the functions and libs, migrate outdated tasks to avoid unexpected errors.');
  console.log(agentCode);
}