const { getOpenAIApiKey, IS_LAMBDA } = require('../constants');
const { initializeExamples } = require('./examples');

async function initializeLambda() {
  // --- X-Ray global HTTPS patching ---
  // We only patch in the Lambda environment; this automatically
  // creates sub-segments for every outbound https request. We still
  // inject the trace header manually for SigV4-signed requests in
  // src/services/agent/handler.ts so the signature remains valid.
  if (IS_LAMBDA && process.env.AWS_XRAY_ENABLED === 'true') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AWSXRay = require('aws-xray-sdk-core');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const https = require('https');
    AWSXRay.captureHTTPsGlobal(https);
    AWSXRay.setContextMissingStrategy(() => {});
  }

  const apiKey = await getOpenAIApiKey();

  if (!apiKey) throw new Error('OPENAI_API_KEY not found in secret or env var');
  if (!process.env.OPENAI_MODEL) throw new Error('OPENAI_MODEL env var not set');
  if (!process.env.OPENAI_EMBEDDING_MODEL) throw new Error('OPENAI_EMBEDDING_MODEL env var not set');

  await initializeExamples();
}

module.exports = {
  initializeLambda,
};