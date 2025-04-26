from constants import AGENT_GATEWAY_URL, AGENT_GATEWAY_TOKEN
from logger import log, logErr
import requests

def get_delegation_token(target_agent_id, delegation_token):

    log("agent-gateway", "getDelegationToken", { target_agent_id })

    if not AGENT_GATEWAY_URL or not AGENT_GATEWAY_TOKEN:
        raise Exception("Agent gateway is not configured")
    
    if not delegation_token:
        raise Exception("Delegation token is not provided")

    response = requests.post(
        f"{AGENT_GATEWAY_URL}/auth/delegate",
        json={
            "target_agent_id": target_agent_id,
            "delegation_token": delegation_token
        },
        headers={
            'Authorization': f'Bearer {AGENT_GATEWAY_TOKEN}',
            'Content-Type': 'application/json'
        }
    )

    if response.status_code != 200:
        raise Exception(f"Agent gateway: Failed to get delegation token: {response.status_code} {response.text}")

    return response.json()['delegation_token']

class AgentGateway:
    def __init__(self, delegation_token):
        self.delegation_token = delegation_token

    def call_agent(self, messages, include_tool_messages, max_tokens, temperature, stream, agent_id):
        
        new_delegation_token = get_delegation_token(agent_id, self.delegation_token)

        log("agent-gateway", "callAgent", { agent_id })

        response = requests.post(
            f"{AGENT_GATEWAY_URL}/completions", 
            json={
                "messages": messages,
                "agentId": agent_id,
                "includeToolMessages": include_tool_messages,
                "maxTokens": max_tokens,
                "temperature": temperature,
                "stream": stream,
                "delegationToken": new_delegation_token
            },
            headers={
                'Authorization': f'Bearer {self.AGENT_GATEWAY_TOKEN}',
                'Content-Type': 'application/json'
            }
        )

        if response.status_code != 200:
            raise Exception(f"Agent gateway: Failed to call agent: {response.status_code} {response.text}")

        data = response.json()
        # Extract content from the response structure
        content = data.get('choices', [{}])[0].get('message', {}).get('content')
        
        # Return both the full response data and the extracted content
        return {**data, 'content': content}
