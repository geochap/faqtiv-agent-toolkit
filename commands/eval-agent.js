import fs from 'fs';
import axios from 'axios';
import { 
  createLLMAsJudge, 
  CORRECTNESS_PROMPT, 
  CONCISENESS_PROMPT, 
  HALLUCINATION_PROMPT,
  RAG_HELPFULNESS_PROMPT,
  RAG_GROUNDEDNESS_PROMPT,
  RAG_RETRIEVAL_RELEVANCE_PROMPT
} from 'openevals';
import {
  createTrajectoryLLMAsJudge,
  TRAJECTORY_ACCURACY_PROMPT_WITH_REFERENCE
} from "agentevals";
import { setupServer, startServer, shutdownServer } from '../lib/server-manager.js';
import dotenv from 'dotenv';

dotenv.config();

const EVAL_MODEL = process.env.OPENAI_MODEL || "openai:gpt-4o";
const DEFAULT_THRESHOLD = 0.7;

// Map of available metrics to their prompts
const AVAILABLE_METRICS = {
  correctness: CORRECTNESS_PROMPT,
  conciseness: CONCISENESS_PROMPT,
  hallucination: HALLUCINATION_PROMPT,
  rag_helpfulness: RAG_HELPFULNESS_PROMPT,
  rag_groundedness: RAG_GROUNDEDNESS_PROMPT,
  rag_retrieval_relevance: RAG_RETRIEVAL_RELEVANCE_PROMPT,
  trajectory_accuracy: TRAJECTORY_ACCURACY_PROMPT_WITH_REFERENCE
};

/**
 * Calculate score and determine pass/fail status based on threshold
 * @param {number} score - The raw score
 * @param {number} threshold - The threshold for passing
 * @returns {object} - Score details including percentage and pass/fail status
 */
function calculateScore(score, threshold) {
  const percentage = score * 100;
  return {
    percentage: percentage.toFixed(2),
    passed: score >= threshold,
    threshold
  };
}

/**
 * Create evaluators for the specified metrics
 * @param {string[]} metrics - List of metrics to evaluate
 * @returns {object} - Map of metric names to their evaluators
 */
function createEvaluators(metrics) {
  const evaluators = {};
  
  for (const metric of metrics) {
    const metricKey = metric.toLowerCase();
    if (AVAILABLE_METRICS[metricKey]) {
      if (metricKey === 'trajectory_accuracy') {
        // Special case for trajectory accuracy which requires a different evaluator
        evaluators[metricKey] = createTrajectoryLLMAsJudge({
          prompt: AVAILABLE_METRICS[metricKey],
          model: EVAL_MODEL,
        });
      } else {
        evaluators[metricKey] = createLLMAsJudge({
          prompt: AVAILABLE_METRICS[metricKey],
          feedbackKey: metricKey,
          model: EVAL_MODEL,
        });
      }
    } else {
      console.warn(`Warning: Unknown metric "${metric}" will be skipped`);
    }
  }
  
  return evaluators;
}

/**
 * Evaluate a response using the specified metrics
 * @param {object} context - The conversation context
 * @param {string} query - The user's query
 * @param {string} response - The assistant's response
 * @param {string} originalResponse - The original response to compare against
 * @param {number} threshold - The threshold for passing
 * @param {object} evaluators - Map of metric names to their evaluators
 * @returns {Promise<object>} - The evaluation scores
 */
async function evaluateResponse(context, query, response, originalResponse, threshold, evaluators) {
  const results = {};
  
  for (const [metric, evaluator] of Object.entries(evaluators)) {
    if (metric === 'trajectory_accuracy') {
      // Special case for trajectory accuracy which requires full conversation trajectories
      // This would need to be handled differently in the processConversation function
      continue;
    }
    
    const evalResult = await evaluator({
      context,
      inputs: query,
      outputs: response,
      reference_outputs: originalResponse,
    });
    
    results[metric] = {
      ...evalResult,
      scoreDetails: calculateScore(evalResult.score, threshold)
    };
  }
  
  return results;
}

/**
 * Extract content from a message, ignoring tool calls and tool responses
 * @param {object} message - The message object
 * @returns {string} - The message content
 */
function extractMessageContent(message) {
  if (!message) return "";
  
  // Ignore tool_calls and tool responses
  if (message.tool_calls || message.role === 'tool') {
    return "";
  }
  
  return message.content || "";
}

/**
 * Find the last user message and its corresponding assistant responses
 * @param {Array} messages - The conversation messages array
 * @returns {Object} - Object containing the last user message and assistant responses
 */
function findLastUserAssistantPair(messages) {
  let lastUserIndex = -1;
  let lastAssistantResponses = [];
  
  // Find the last user message
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIndex = i;
      break;
    }
  }
  
  // If we found a user message, collect its assistant responses
  if (lastUserIndex !== -1) {
    let j = lastUserIndex + 1;
    
    // Collect all assistant responses until next user message or end of conversation
    while (j < messages.length && messages[j].role !== 'user') {
      lastAssistantResponses.push(messages[j]);
      j++;
    }
  }
  
  return {
    lastUserIndex,
    lastUserMessage: lastUserIndex !== -1 ? messages[lastUserIndex] : null,
    lastAssistantResponses
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
  let results = {};
  const threshold = conversationData.threshold || DEFAULT_THRESHOLD;
  const metrics = conversationData.metrics || ['correctness', 'conciseness', 'hallucination'];
  
  // Create evaluators for the specified metrics
  const evaluators = createEvaluators(metrics);
  
  // Check if trajectory_accuracy is one of the metrics
  const hasTrajectoryAccuracy = metrics.some(m => m.toLowerCase() === 'trajectory_accuracy');

  // Find the last user-assistant pair
  const { lastUserIndex, lastUserMessage, lastAssistantResponses } = findLastUserAssistantPair(conversationData.messages);
  
  // If we have a user message and assistant responses, evaluate them
  if (lastUserIndex !== -1 && lastAssistantResponses.length > 0) {
    // Check if any assistant response contains tool_calls
    const hasToolCalls = lastAssistantResponses.some(msg => 
      msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0
    );
    
    // Fail if trajectory_accuracy is requested but no tool_calls are present
    if (hasTrajectoryAccuracy && !hasToolCalls) {
      console.error('Error: Trajectory accuracy evaluation requires tool_calls data, but none were found in the conversation.');
      process.exit(1);
    }
    
    // Get completion from server
    const response = await axios.post(`${serverUrl}/completions`, {
      messages: [{ role: 'user', content: lastUserMessage.content }],
      include_tool_messages: hasToolCalls
    });

    const newResponse = response.data.choices[0].message.content;

    // For trajectory accuracy, we need to update the messages
    if (hasTrajectoryAccuracy) {
      const newToolMessages = response.data.tool_messages ? response.data.tool_messages.map(msg => msg.choices[0].delta) : [];

      // Create a new messages array containing lastUserMessage + newToolMessages + newResponse
      const newMessages = [];
      
      // Add the last user message
      newMessages.push(lastUserMessage);
      
      // Add tool messages if they exist
      if (newToolMessages.length > 0) {
        newMessages.push(...newToolMessages);
      }
      
      // Add the new assistant response
      newMessages.push({
        role: 'assistant',
        content: newResponse
      });

      // Create a reference messages array with only the last user-assistant pair
      const referenceMessages = [];
      
      // Add the last user message and assistant responses
      if (lastUserMessage) {
        referenceMessages.push(lastUserMessage);
        referenceMessages.push(...lastAssistantResponses);
      }

      const trajectoryEvaluator = evaluators['trajectory_accuracy'];
      
      // For trajectory accuracy, evaluate with the new messages
      const trajectoryResult = await trajectoryEvaluator({
        outputs: newMessages,
        referenceOutputs: referenceMessages
      });
      
      results['trajectory_accuracy'] = {
        ...trajectoryResult,
        scoreDetails: calculateScore(trajectoryResult.score, threshold)
      };
    }
    
    // Combine all assistant responses into a single string for evaluation
    const originalResponse = lastAssistantResponses
      .map(msg => extractMessageContent(msg))
      .filter(content => content)
      .join("\n");
    
    // Create context from previous messages (excluding the last user-assistant pair)
    const contextMessages = conversationData.messages.slice(0, lastUserIndex);
    
    // Convert contextMessages to a string format
    const contextMessagesString = contextMessages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');
    
    // Concatenate contextMessages to conversationData.context
    const fullContext = conversationData.context 
      ? `${conversationData.context}\n\nConversation:\n${contextMessagesString}`
      : `Conversation:\n${contextMessagesString}`;
    
    // Evaluate both responses
    const evaluationResults = await evaluateResponse(
      fullContext, 
      lastUserMessage.content, 
      newResponse, 
      originalResponse, 
      threshold,
      evaluators
    );
    
    // Merge the evaluation results with the existing results
    results = { ...results, ...evaluationResults };
  }

  return { results, threshold, metrics };
}

/**
 * Evaluate an agent using a conversation file
 * @param {string} file - Path to the conversation file
 * @param {object} options - Options for evaluation
 * @param {string} options.url - Optional URL of an existing server
 * @returns {Promise<void>}
 */
export default async function evalAgent(file, options = {}) {
  const conversationPath = file;
  let serverUrl = options.url;
  let serverProcess = null;
  let shutdownKey = null;

  if (!conversationPath) {
    throw new Error('Conversation path is required');
  }

  try {
    // If no URL is provided, spin up a server
    if (!serverUrl) {
      // Setup server with default port 8000
      const serverInfo = await setupServer({ port: 8000 });
      
      // Start server
      const serverData = await startServer(serverInfo);
      serverUrl = serverData.serverUrl;
      serverProcess = serverData.serverProcess;
      shutdownKey = serverData.shutdownKey;
    }

    // Process conversation and get results
    const { results, threshold, metrics } = await processConversation(conversationPath, serverUrl);
    
    // Calculate summary statistics
    const totalMetrics = results ? Object.keys(results).length : 0;
    const passedMetrics = results ? Object.values(results).filter(r => r.scoreDetails.passed).length : 0;
    
    const summary = {
      passRate: totalMetrics > 0 ? (passedMetrics / totalMetrics) * 100 : 0,
      passedCount: passedMetrics,
      totalCount: totalMetrics
    };

    // Create JSON output
    const output = {
      configuration: {
        threshold: threshold * 100,
        metrics: metrics
      },
      summary: summary,
      result: results ? Object.entries(results).map(([metric, evalResult]) => ({
        metric,
        score: evalResult.scoreDetails.percentage,
        passed: evalResult.scoreDetails.passed,
        comment: evalResult.comment
      })) : []
    };

    // Output JSON to stdout
    console.log(JSON.stringify(output, null, 2));
  } finally {
    // Only shutdown server if we started one
    if (serverProcess) {
      await shutdownServer({ serverUrl, shutdownKey, serverProcess });
    }
  }
} 