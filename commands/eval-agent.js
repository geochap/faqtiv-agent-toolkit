import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { createLLMAsJudge, CORRECTNESS_PROMPT, CONCISENESS_PROMPT, HALLUCINATION_PROMPT } from 'openevals';
import * as config from '../config.js';
import { setupServer, startServer, shutdownServer } from '../libs/server-manager.js';

// Initialize evaluators
const correctnessEvaluator = createLLMAsJudge({
  prompt: CORRECTNESS_PROMPT,
  feedbackKey: "correctness",
  model: "openai:gpt-4-turbo-preview",
});

const concisenessEvaluator = createLLMAsJudge({
  prompt: CONCISENESS_PROMPT,
  feedbackKey: "conciseness",
  model: "openai:gpt-4-turbo-preview",
});

const hallucinationEvaluator = createLLMAsJudge({
  prompt: HALLUCINATION_PROMPT,
  feedbackKey: "hallucination",
  model: "openai:gpt-4-turbo-preview",
});

/**
 * Evaluate a response using the LLM judges
 * @param {string} query - The user's query
 * @param {string} response - The assistant's response
 * @param {string} originalResponse - The original response to compare against
 * @returns {Promise<object>} - The evaluation scores
 */
async function evaluateResponse(context, query, response, originalResponse) {
  // Correctness evaluation
  const correctness = await correctnessEvaluator({
    inputs: query,
    outputs: response,
    reference_outputs: originalResponse,
  });

  // Conciseness evaluation
  const conciseness = await concisenessEvaluator({
    inputs: query,
    outputs: response,
    reference_outputs: originalResponse,
  });

  // Hallucination evaluation
  const hallucination = await hallucinationEvaluator({
    context,
    inputs: query,
    outputs: response,
    reference_outputs: originalResponse,
  });

  return {
    correctness,
    conciseness,
    hallucination,
  };
}

/**
 * Process a conversation file and evaluate responses
 * @param {string} conversationPath - Path to the conversation file
 * @param {string} serverUrl - URL of the server to use for completions
 * @returns {Promise<object>} - The evaluation results
 */
async function processConversation(conversationPath, serverUrl) {
  const conversationData = JSON.parse(fs.readFileSync(conversationPath, 'utf8'));
  const results = [];

  // Process each user message and its corresponding assistant response
  for (let i = 0; i < conversationData.messages.length; i += 2) {
    if (i + 1 >= conversationData.messages.length) break;
    
    const userMessage = conversationData.messages[i];
    const assistantMessage = conversationData.messages[i + 1];
    
    if (userMessage.role === 'user' && assistantMessage.role === 'assistant') {
      // Get completion from server
      const response = await axios.post(`${serverUrl}/completions`, {
        messages: [{ role: 'user', content: userMessage.content }]
      });

      const newResponse = response.data.choices[0].message.content;
      
      // Evaluate both responses
      const evalResponse = await evaluateResponse(conversationData.context, userMessage.content, newResponse, assistantMessage.content);

      results.push(evalResponse);
    }
  }

  return results;
}

/**
 * Evaluate an agent using a conversation file
 * @param {string} file - Path to the conversation file
 * @param {object} options - Options for evaluation
 * @param {number} options.port - Port to run the server on
 * @returns {Promise<void>}
 */
export default async function evalAgent(file, options = {}) {
  const conversationPath = file;
  const port = options.port || 8000;

  if (!conversationPath) {
    throw new Error('Conversation path is required');
  }

  // Setup server
  const serverInfo = await setupServer({ port });
  
  // Start server
  const { serverProcess, shutdownKey, serverUrl } = await startServer(serverInfo);

  try {
    // Process conversation and get results
    const results = await processConversation(conversationPath, serverUrl);
    
    // Print results
    console.log('\nEvaluation Results:');
    console.log('------------------');
    console.log(`Total messages evaluated: ${results.length}`);
    
    // Print detailed results for each message
    console.log('\nDetailed Results:');
    console.log('----------------');
    results.forEach((result, index) => {
      console.log(`\nMessage ${index + 1}:`);
      console.log(`Correctness: ${result.correctness.score ? 'Pass' : 'Fail'} - ${result.correctness.comment}`);
      console.log(`Conciseness: ${result.conciseness.score ? 'Pass' : 'Fail'} - ${result.conciseness.comment}`);
      console.log(`Hallucination: ${result.hallucination.score ? 'Pass' : 'Fail'} - ${result.hallucination.comment}`);
    });
  } finally {
    // Shutdown server
    await shutdownServer({ serverUrl, shutdownKey, serverProcess });
  }
} 