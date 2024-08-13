import { SystemMessage, AIMessage } from "@langchain/core/messages";

export function generateLangchainTools(functions, functionsSignatures) {
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


Generate a python langchain tools definition script. Apply the following requirements:

- From SIGNATURES extract the function description to be added to the tool function body
- From FUNCTIONS use the code to define the functions as tools
- For any complex tool function argument types like classes from third party dependencies use "Any" as a type instead
- Make sure that every function definition has the @tool decorator and the description but do not modify the function any further
- For dependency imports only add the imports in the function "imports" property and nothing else
- The end result should be a valid python script where each function looks like the original but has the @tool decorator, has a description in the first line of the function body and any complex type arguments are replaced with "Any"
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
`),
  new AIMessage(
`@tool
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
`)
]