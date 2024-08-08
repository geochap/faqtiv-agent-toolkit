import { SystemMessage, AIMessage } from "@langchain/core/messages";

export function generateLangchainAgent(libs, functions, functionsSignatures) {
  const prompt = `
Given these python function signatures, functions code and metadata, libs code and agent prompt:

SIGNATURES:
\`\`\`
${functionsSignatures}
\`\`\`

FUNCTIONS:
\`\`\`
${JSON.stringify(functions, null, 2)}
\`\`\`

LIBS:
\`\`\`
${JSON.stringify(libs, null, 2)}
\`\`\`

AGENT PROMPT:
\`\`\`
You are a technical assistant that answers questions using the available tools:

${functionsSignatures}
\`\`\`

Generate a single python langchain agent script which can answer questions using these functions as tools. Apply the following requirements:

- From SIGNATURES extract the function description to be added to the tool function body
- From FUNCTIONS use the code to define the functions as tools
- From FUNCTIONS use the imports to add all imports to the python script that the functions need to work
- From LIBS use the code to define regular functions which are not tools but function dependencies of the tools
- From LIBS use the imports to add all imports to the python script that the lib functions need to work
- Use AGENT PROMPT as the system prompt for the agent
- Make sure the scripts has all necessary imports for the functions to work
- For any complex tool function argument types like classes from third party dependencies use "Any" as a type instead
- This is a standalone python script that runs from command line so it should take in a prompt parameter and print the output to stdout
- Do not wrap the response in a code block or add anything else besides the script's code
`;

  return prompt;
}

export const examples = [
  new SystemMessage(`
SIGNATURES:
\`\`\`
get_bank_branches(bank_id: int) : List[Dict[str, Union[str, int]]] - Retrieves bank branches by bank ID. Returns a list of dictionaries with properties id, address, city, county, state, and zip
get_bank_financials(bank_id: int) : List[Dict[str, Union[str, int]]] - Retrieves the financial summary of a bank by bank ID. Returns a list of dictionaries with properties report_date and total_deposits
get_bank_id_by_name(name: str) : int - Retrieves the bank ID for a given bank name
\`\`\`

FUNCTIONS
\`\`\`
[
  {
    "name": "get_bank_branches",
    "code": "def get_bank_branches(bank_id):\n    url = f'https://banks.data.fdic.gov/api/locations?filters=CERT%3A{bank_id}&fields=NAME%2CUNINUM%2CSERVTYPE%2CRUNDATE%2CCITY%2CSTNAME%2CZIP%2CCOUNTY%2CADDRESS%2CMAINOFF&sort_by=NAME&sort_order=DESC&limit=10000&offset=0&format=json&download=false'\n    response = requests.get(url)\n    response_data = response.json()\n    return [\n        {\n            'id': branch['data']['ID'],\n            'address': branch['data']['ADDRESS'],\n            'city': branch['data']['CITY'],\n            'county': branch['data']['COUNTY'],\n            'state': branch['data']['STNAME'],\n            'zip': branch['data']['ZIP'],\n        } for branch in response_data['data']\n    ]\n\n",
    "lastModified": "2024-08-03T01:53:54.125Z",
    "imports": [
      "import requests"
    ]
  },
  {
    "name": "get_bank_financials",
    "code": "def get_bank_financials(bank_id):\n    url = f'https://banks.data.fdic.gov/api/financials?filters=CERT%3A{bank_id}&fields=CERT%2CREPDTE%2CASSET%2CDEP&sort_by=REPDTE&sort_order=DESC&limit=10&offset=0&agg_by=REPDTE&agg_sum_fields=DEP&agg_limit=1000&format=json&download=false&filename=data_file'\n    response = requests.get(url)\n    response_data = response.json()\n    return [\n        {\n            'report_date': f\"{r['data']['REPDTE'][:4]}-{r['data']['REPDTE'][4:6]}-{r['data']['REPDTE'][6:]}\",\n            'total_deposits': r['data']['sum_DEP'] *  1000\n        } for r in response_data['data']\n    ]\n\n",
    "lastModified": "2024-08-03T01:53:54.125Z",
    "imports": [
      "import requests"
    ]
  },
  {
    "name": "get_bank_id_by_name",
    "code": "def get_bank_id_by_name(name):\n    url = f'https://banks.data.fdic.gov/api/institutions?filters=ACTIVE%3A1&search=NAME:{requests.utils.quote(name)}&fields=NAME'\n    response = requests.get(url)\n    response_data = response.json()\n    return response_data['data'][0]['data']['ID']\n",
    "lastModified": "2024-08-03T01:53:54.125Z",
    "imports": [
      "import requests"
    ]
  }
]
\`\`\`

LIBS
\`\`\`
[
  {
    "name": "lib_example",
    "code": "def lib_example():\n print("this is just an example") \n",
    "lastModified": "2024-08-03T01:53:54.125Z",
    "imports": []
  }
]
\`\`\`

INSTRUCTIONS
\`\`\`
Using the available tools answer the user's question
\`\`\`
`),
  new AIMessage(
`import os
import requests
import argparse
from typing import List, Dict, Union
from langchain_core.tools import tool
from langchain_core.prompts import ChatPromptTemplate
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_openai import ChatOpenAI

def lib_example():
    print("this is just an example")

@tool
def get_bank_branches(bank_id: int) -> List[Dict[str, Union[str, int]]]:
    """"Retrieves bank branches by bank ID. Returns a list of dictionaries with properties id, address, city, county, state, and zip.","""
    url = f'https://banks.data.fdic.gov/api/locations?filters=CERT%3A{bank_id}&fields=NAME%2CUNINUM%2CSERVTYPE%2CRUNDATE%2CCITY%2CSTNAME%2CZIP%2CCOUNTY%2CADDRESS%2CMAINOFF&sort_by=NAME&sort_order=DESC&limit=10000&offset=0&format=json&download=false'
    response = requests.get(url)
    response_data = response.json()
    return [
        {
            'id': branch['data']['ID'],
            'address': branch['data']['ADDRESS'],
            'city': branch['data']['CITY'],
            'county': branch['data']['COUNTY'],
            'state': branch['data']['STNAME'],
            'zip': branch['data']['ZIP'],
        } for branch in response_data['data']
    ]

@tool
def get_bank_financials(bank_id: int) -> List[Dict[str, Union[str, int]]]:
    """Retrieves the financial summary of a bank by bank ID. Returns a list of dictionaries with properties report_date and total_deposits."""
    url = f'https://banks.data.fdic.gov/api/financials?filters=CERT%3A{bank_id}&fields=CERT%2CREPDTE%2CASSET%2CDEP&sort_by=REPDTE&sort_order=DESC&limit=10&offset=0&agg_by=REPDTE&agg_sum_fields=DEP&agg_limit=1000&format=json&download=false&filename=data_file'
    response = requests.get(url)
    response_data = response.json()
    return [
        {
            'report_date': f"{r['data']['REPDTE'][:4]}-{r['data']['REPDTE'][4:6]}-{r['data']['REPDTE'][6:]}",
            'total_deposits': r['data']['sum_DEP'] *  1000
        } for r in response_data['data']
    ]

@tool
def get_bank_id_by_name(name: str) -> int:
    """Retrieves the bank ID for a given bank name"""
    url = f'https://banks.data.fdic.gov/api/institutions?filters=ACTIVE%3A1&search=NAME:{requests.utils.quote(name)}&fields=NAME'
    response = requests.get(url)
    response_data = response.json()
    return response_data['data'][0]['data']['ID']

tools = [
    get_bank_branches,
    get_bank_financials,
    get_bank_id_by_name
]

promptText = """
Using the available tools answer the user's question
"""

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

# Set up command-line argument parsing
parser = argparse.ArgumentParser(description="Ask a question to the bank agent.")
parser.add_argument('question', type=str, help='The question to ask the agent')
args = parser.parse_args()

# Execute the question
result = agent_executor.invoke({"input": args.question})
print(result['output'])
`)
]