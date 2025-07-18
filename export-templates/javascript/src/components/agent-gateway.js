const { AGENT_GATEWAY_URL, getAgentGatewayToken } = require("../constants");
const { log, logErr } = require("./logger");
const { injectTraceHeader } = require("./xray");
const AWSXRay = require('aws-xray-sdk-core');

async function getDelegationToken(targetAgentId, delegationToken, requestId) {

  log("agent-gateway", "getDelegationToken", { targetAgentId });

  const AGENT_GATEWAY_TOKEN = await getAgentGatewayToken();

  if (!AGENT_GATEWAY_URL || !AGENT_GATEWAY_TOKEN) {
    throw new Error("Agent gateway is not configured");
  }

  if (!delegationToken) {
    throw new Error("Delegation token is not provided");
  }

  const headers = {
    'Authorization': `Bearer ${AGENT_GATEWAY_TOKEN}`,
    'Content-Type': 'application/json'
  };
  if (requestId) headers['X-Request-ID'] = requestId;
  injectTraceHeader(headers);

  const resultToken = await AWSXRay.captureAsyncFunc('agent-getDelegationToken', async (sub) => {
    if (sub) {
      sub.addAnnotation('targetAgentId', targetAgentId);
      sub.addAnnotation('action', 'getDelegationToken');
      if (requestId) sub.addAnnotation('requestId', requestId);
    }

    const response = await fetch(`${AGENT_GATEWAY_URL}/auth/delegate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        target_agent_id: targetAgentId,
        delegation_token: delegationToken
      })
    });

    if (!response.ok) {
      const responseText = await response.text();
      logErr("agent-gateway", "getDelegationToken", { targetAgentId, response: responseText });
      throw new Error(`Agent gateway: Failed to get delegation token (${response.statusText}): ${responseText}`);
    }

    const result = await response.json();
    if (sub) sub.close();
    return result.token;
  });

  return resultToken;
}

async function callAgent({ messages, includeToolMessages, maxTokens, temperature, stream, agentId, delegationToken, requestId }) {

  const AGENT_GATEWAY_TOKEN = await getAgentGatewayToken();
  const newDelegationToken = await getDelegationToken(agentId, delegationToken, requestId);

  log("agent-gateway", "callAgent", { agentId });

  const headers = {
    'Authorization': `Bearer ${AGENT_GATEWAY_TOKEN}`,
    'Content-Type': 'application/json'
  };
  if (requestId) headers['X-Request-ID'] = requestId;
  injectTraceHeader(headers);

  const resultContent = await AWSXRay.captureAsyncFunc('agent-callAgent', async (sub) => {
    if (sub) {
      sub.addAnnotation('agentId', agentId);
      sub.addAnnotation('action', 'callAgent');
      if (requestId) sub.addAnnotation('requestId', requestId);
    }

    const response = await fetch(`${AGENT_GATEWAY_URL}/completions`, {
      method: "POST",
      headers,
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
      const responseText = await response.text();
      logErr("agent-gateway", "callAgent", { agentId, response: responseText });
      throw new Error(`Agent gateway: Failed to call agent (${response.statusText}): ${responseText}`);
    }

    const data = await response.json();
    if (sub) sub.close();
    return data.choices?.[0]?.message?.content;
  });

  return resultContent;
}

module.exports = {
  getDelegationToken,
  callAgent
};