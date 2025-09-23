const { AGENT_GATEWAY_URL, getAgentGatewayToken, getAgentGatewayRefreshToken, getAgentGatewayTokenId, getAgentGatewaySourceAgentId } = require("../constants");
const { log, logErr } = require("./logger");
const { injectTraceHeader } = require("./xray");
const AWSXRay = require('aws-xray-sdk-core');

// Token cache to store access and refresh tokens
let tokenCache = {
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  isRefreshing: false
};

/**
 * Get a valid access token, refreshing if necessary
 */
async function getValidAccessToken() {
  // If we have a valid cached token, return it
  if (tokenCache.accessToken && tokenCache.expiresAt && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }

  // If we're already refreshing, wait for it to complete
  if (tokenCache.isRefreshing) {
    await waitForTokenRefresh();
    return tokenCache.accessToken;
  }

  // If we have a refresh token, try to refresh
  if (tokenCache.refreshToken) {
    try {
      await refreshAccessToken();
      return tokenCache.accessToken;
    } catch (error) {
      logErr("agent-gateway", "refreshAccessToken", { error: error.message });
      // If refresh fails, fall back to getting a new token
    }
  }

    // Try to get refresh token from environment variables
    try {
      const envRefreshToken = await getAgentGatewayRefreshToken();
      const envTokenId = await getAgentGatewayTokenId();
      const envSourceAgentId = await getAgentGatewaySourceAgentId();
      if (envRefreshToken && envTokenId && envSourceAgentId) {
        tokenCache.refreshToken = envRefreshToken;
        tokenCache.tokenId = envTokenId;
        tokenCache.sourceAgentId = envSourceAgentId;
        try {
          await refreshAccessToken();
          return tokenCache.accessToken;
        } catch (error) {
          logErr("agent-gateway", "refreshAccessToken", { error: error.message });
          // If refresh fails, fall back to getting a new token
        }
      }
    } catch (error) {
      logErr("agent-gateway", "getAgentGatewayRefreshToken", { error: error.message });
      // Continue to fallback method
    }

  // Get a new token (fallback to original method)
  return await getAgentGatewayToken();
}

/**
 * Wait for token refresh to complete
 */
async function waitForTokenRefresh() {
  const maxWaitTime = 10000; // 10 seconds
  const checkInterval = 100; // 100ms
  let waited = 0;

  while (tokenCache.isRefreshing && waited < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, checkInterval));
    waited += checkInterval;
  }

  if (waited >= maxWaitTime) {
    throw new Error('Token refresh timeout');
  }
}

/**
 * Refresh the access token using the refresh token
 */
async function refreshAccessToken() {
  if (!tokenCache.refreshToken) {
    throw new Error('No refresh token available');
  }

  if (!tokenCache.tokenId) {
    throw new Error('No token ID available');
  }

  if (!tokenCache.sourceAgentId) {
    throw new Error('No source agent ID available');
  }

  tokenCache.isRefreshing = true;

  try {
    log("agent-gateway", "refreshAccessToken", { message: "Refreshing access token" });

    const response = await fetch(`${AGENT_GATEWAY_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        refreshToken: tokenCache.refreshToken,
        tokenId: tokenCache.tokenId,
        sourceAgentId: tokenCache.sourceAgentId
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token refresh failed: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    
    if (data.success) {
      // Update token cache
      tokenCache.accessToken = data.accessToken;
      tokenCache.expiresAt = Date.now() + (data.expiresIn * 1000) - 60000; // 1 minute buffer
      
      log("agent-gateway", "refreshAccessToken", { 
        message: "Token refreshed successfully",
        expiresIn: data.expiresIn 
      });
    } else {
      throw new Error(data.error || 'Token refresh failed');
    }
  } finally {
    tokenCache.isRefreshing = false;
  }
}

async function getDelegationToken(targetAgentId, delegationToken, requestId) {

  log("agent-gateway", "getDelegationToken", { targetAgentId });

  const AGENT_GATEWAY_TOKEN = await getValidAccessToken();

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

  const AGENT_GATEWAY_TOKEN = await getValidAccessToken();
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
  callAgent,
  getValidAccessToken,
};