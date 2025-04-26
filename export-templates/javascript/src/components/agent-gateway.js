const { AGENT_GATEWAY_URL, AGENT_GATEWAY_TOKEN } = require("../constants");
const { log, logErr } = require("./logger");

async function getDelegationToken(targetAgentId, delegationToken) {

  log("agent-gateway", "getDelegationToken", { targetAgentId });

  if (!AGENT_GATEWAY_URL || !AGENT_GATEWAY_TOKEN) {
    throw new Error("Agent gateway is not configured");
  }

  if (!delegationToken) {
    throw new Error("Delegation token is not provided");
  }

  const response = await fetch(`${AGENT_GATEWAY_URL}/auth/delegate`, {
    method: "POST",
    headers: {
      'Authorization': `Bearer ${AGENT_GATEWAY_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      target_agent_id: targetAgentId,
      delegation_token: delegationToken
    })
  });

  if (!response.ok) {
    logErr("agent-gateway", "getDelegationToken", { targetAgentId, response: await response.json() });
    throw new Error(`Agent gateway: Failed to get delegation token: ${response.statusText}`);
  }

  const result = await response.json();

  return result.token;
}

async function callAgent({ messages, includeToolMessages, maxTokens, temperature, stream, agentId, delegationToken }) {

  const newDelegationToken = await getDelegationToken(agentId, delegationToken);

  log("agent-gateway", "callAgent", { agentId });

  const response = await fetch(`${AGENT_GATEWAY_URL}/completions`, {
    method: "POST",
    headers: {
      'Authorization': `Bearer ${AGENT_GATEWAY_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages,
      agent_id: agentId,
      include_tool_messages: includeToolMessages,
      max_tokens: maxTokens,
      temperature,
      stream,
      delegation_token: newDelegationToken
    }),
  });

  if (!response.ok) {
    logErr("agent-gateway", "callAgent", { agentId, response: await response.json() });
    throw new Error(`Agent gateway: Failed to call agent: ${response.statusText}`);
  }

  const data = await response.json();

  return data.choices?.[0]?.message?.content;
}

module.exports = {
  getDelegationToken,
  callAgent
};