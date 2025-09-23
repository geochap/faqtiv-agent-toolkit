const log4js = require('log4js');
const z = require('zod');
const { logDir } = require('./components/logger');
const dotenv = require('dotenv');

dotenv.config();

// Agent lib and functions dependencies
{{ imports }}

// Agent libs
{{ libs }}

// Agent functions
{{ functions }}

// Agent tasks
const TASKS = {
  {{ tasks }}
};

const TASK_TOOL_SCHEMAS = [{{ taskToolSchemas }}];

const COMPLETION_PROMPT_TEXT = `{{ getAssistantInstructionsPrompt }}`;

const TASK_NAME_TO_FUNCTION_NAME_MAP = {{ taskNameToFunctionNameMap }};

const TASK_TOOL_CALL_DESCRIPTION_TEMPLATES = {{ taskToolCallDescriptionTemplates }};

const ADHOC_PROMPT_TEXT = `{{ generateAnsweringFunctionPrompt }}`;

const LIBS = { {{ libsNames }} };

const FUNCTIONS = { {{ functionNames }} };

const IS_LAMBDA = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const AGENT_GATEWAY_URL = process.env.AGENT_GATEWAY_URL;

const ENV_VARS = {
  DATA_FILES: IS_LAMBDA ? "./data" : "./src/data"
};

async function getOpenAIApiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;

  const AWS = require('aws-sdk');
  const secretsManager = new AWS.SecretsManager();
  const secretName = process.env.OPENAI_API_KEY_SECRET_NAME;

  if (!secretName) throw new Error('OPENAI_API_KEY or OPENAI_API_KEY_SECRET_NAME env var not set');

  const data = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
  const apiKey = data.SecretString;

  if (!apiKey || apiKey === '') throw new Error('OPENAI_API_KEY not found in secret or env var');

  process.env.OPENAI_API_KEY = apiKey;

  return apiKey;
}

async function getAgentGatewayToken() {
  if (process.env.AGENT_GATEWAY_TOKEN) return process.env.AGENT_GATEWAY_TOKEN;

  const AWS = require('aws-sdk');
  const secretsManager = new AWS.SecretsManager();
  const secretName = process.env.AGENT_GATEWAY_TOKEN_SECRET_NAME;

  if (!secretName) throw new Error('AGENT_GATEWAY_TOKEN or AGENT_GATEWAY_TOKEN_SECRET_NAME env var not set');

  const data = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
  const token = data.SecretString;

  if (!token || token === '') throw new Error('AGENT_GATEWAY_TOKEN not found in secret or env var');

  process.env.AGENT_GATEWAY_TOKEN = token;

  return token;
}

async function getAgentGatewayRefreshToken() {
  if (process.env.AGENT_GATEWAY_REFRESH_TOKEN) return process.env.AGENT_GATEWAY_REFRESH_TOKEN;

  const AWS = require('aws-sdk');
  const secretsManager = new AWS.SecretsManager();
  const secretName = process.env.AGENT_GATEWAY_REFRESH_TOKEN_SECRET_NAME;

  if (!secretName) throw new Error('AGENT_GATEWAY_REFRESH_TOKEN or AGENT_GATEWAY_REFRESH_TOKEN_SECRET_NAME env var not set');

  const data = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
  const refreshToken = data.SecretString;

  if (!refreshToken || refreshToken === '') throw new Error('AGENT_GATEWAY_REFRESH_TOKEN not found in secret or env var');

  process.env.AGENT_GATEWAY_REFRESH_TOKEN = refreshToken;

  return refreshToken;
}

async function getAgentGatewayTokenId() {
  if (process.env.AGENT_GATEWAY_TOKEN_ID) return process.env.AGENT_GATEWAY_TOKEN_ID;

  const AWS = require('aws-sdk');
  const secretsManager = new AWS.SecretsManager();
  const secretName = process.env.AGENT_GATEWAY_TOKEN_ID_SECRET_NAME;

  if (!secretName) throw new Error('AGENT_GATEWAY_TOKEN_ID or AGENT_GATEWAY_TOKEN_ID_SECRET_NAME env var not set');

  const data = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
  const tokenId = data.SecretString;

  if (!tokenId || tokenId === '') throw new Error('AGENT_GATEWAY_TOKEN_ID not found in secret or env var');

  process.env.AGENT_GATEWAY_TOKEN_ID = tokenId;

  return tokenId;
}

async function getAgentGatewaySourceAgentId() {
  if (process.env.AGENT_GATEWAY_SOURCE_AGENT_ID) return process.env.AGENT_GATEWAY_SOURCE_AGENT_ID;

  const AWS = require('aws-sdk');
  const secretsManager = new AWS.SecretsManager();
  const secretName = process.env.AGENT_GATEWAY_SOURCE_AGENT_ID_SECRET_NAME;

  if (!secretName) throw new Error('AGENT_GATEWAY_SOURCE_AGENT_ID or AGENT_GATEWAY_SOURCE_AGENT_ID_SECRET_NAME env var not set');

  const data = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
  const sourceAgentId = data.SecretString;

  if (!sourceAgentId || sourceAgentId === '') throw new Error('AGENT_GATEWAY_SOURCE_AGENT_ID not found in secret or env var');

  process.env.AGENT_GATEWAY_SOURCE_AGENT_ID = sourceAgentId;

  return sourceAgentId;
}

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

module.exports = {
  TASKS,
  TASK_TOOL_SCHEMAS,
  COMPLETION_PROMPT_TEXT,
  TASK_NAME_TO_FUNCTION_NAME_MAP,
  TASK_TOOL_CALL_DESCRIPTION_TEMPLATES,
  ADHOC_PROMPT_TEXT,
  LIBS,
  FUNCTIONS,
  ENV_VARS,
  IS_LAMBDA,
  LOG_LEVEL,
  AGENT_GATEWAY_URL,
  getAgentGatewayToken,
  getAgentGatewayRefreshToken,
  getAgentGatewayTokenId,
  getAgentGatewaySourceAgentId,
  getOpenAIApiKey
};
