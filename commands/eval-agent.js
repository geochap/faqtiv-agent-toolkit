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
import path from 'path';
import * as config from '../config.js';

dotenv.config();

const EVAL_MODEL = process.env.OPENAI_MODEL || "openai:gpt-4o";
const DEFAULT_THRESHOLD = 0.7;
const EVAL_CHOICES = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

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
 * Loads a custom metric from the agent-evals/metrics directory
 * @param {string} metricName - Name of the metric to load
 * @returns {Promise<string|null>} - The loaded metric prompt or null if not found
 */
async function loadCustomMetric(metricName) {
  try {
    const metricPath = path.join(config.project.customMetricsDir, `${metricName}.txt`);
    if (fs.existsSync(metricPath)) {
      return fs.readFileSync(metricPath, 'utf8');
    }
    return null;
  } catch (error) {
    console.warn(`Error loading custom metric "${metricName}": ${error.message}`);
    return null;
  }
}

/**
 * Evaluates a score against a threshold and determines pass/fail status
 * @param {number} score - The raw score
 * @param {number} threshold - The threshold for passing
 * @returns {boolean} - True if the score is greater than or equal to the threshold, false otherwise
 */
function evaluateScoreAgainstThreshold(score, threshold) {
  return score >= threshold;
}

/**
 * Create evaluators for the specified metrics
 * @param {Array} metrics - List of metrics to evaluate, each with name and threshold
 * @returns {Promise<object>} - Map of metric names to their evaluators and thresholds
 */
async function createEvaluators(metrics) {
  const evaluators = {};
  
  for (const metric of metrics) {
    const metricKey = metric.name.toLowerCase();
    let prompt = AVAILABLE_METRICS[metricKey];
    
    // If not found in AVAILABLE_METRICS, try to load custom metric
    if (!prompt) {
      const customMetric = await loadCustomMetric(metricKey);
      if (customMetric) {
        prompt = customMetric;
      } else {
        console.warn(`Warning: Unknown metric "${metric.name}" will be skipped`);
        continue;
      }
    }

    if (metricKey === 'trajectory_accuracy') {
      // Special case for trajectory accuracy which requires a different evaluator
      evaluators[metricKey] = {
        evaluator: createTrajectoryLLMAsJudge({
          prompt,
          choices: EVAL_CHOICES,
          model: EVAL_MODEL,
        }),
        threshold: metric.threshold
      };
    } else {
      evaluators[metricKey] = {
        evaluator: createLLMAsJudge({
          prompt,
          feedbackKey: metricKey,
          choices: EVAL_CHOICES,
          model: EVAL_MODEL,
        }),
        threshold: metric.threshold
      };
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
 * @param {object} evaluators - Map of metric names to their evaluators and thresholds
 * @returns {Promise<object>} - The evaluation scores
 */
async function evaluateResponse(context, query, response, originalResponse, evaluators) {
  const results = {};
  
  for (const [metric, {evaluator, threshold}] of Object.entries(evaluators)) {
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
      passed: evaluateScoreAgainstThreshold(evalResult.score, threshold)
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
  const defaultThreshold = conversationData.threshold || DEFAULT_THRESHOLD;
  const metrics = (conversationData.metrics || [
    { name: 'correctness', threshold: defaultThreshold },
    { name: 'conciseness', threshold: defaultThreshold },
    { name: 'hallucination', threshold: defaultThreshold }
  ]).map(metric => ({
    ...metric,
    threshold: metric.threshold || defaultThreshold
  }));
  
  // Create evaluators for the specified metrics
  const evaluators = await createEvaluators(metrics);
  
  // Check if trajectory_accuracy is one of the metrics
  const hasTrajectoryAccuracy = metrics.some(m => m.name.toLowerCase() === 'trajectory_accuracy');

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
      const trajectoryResult = await trajectoryEvaluator.evaluator({
        outputs: newMessages,
        referenceOutputs: referenceMessages
      });
      
      results['trajectory_accuracy'] = {
        ...trajectoryResult,
        passed: evaluateScoreAgainstThreshold(trajectoryResult.score, trajectoryEvaluator.threshold)
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
      evaluators
    );
    
    // Merge the evaluation results with the existing results
    results = { ...results, ...evaluationResults };
  }

  return { results, metrics, defaultThreshold };
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
    const { results, metrics, defaultThreshold } = await processConversation(conversationPath, serverUrl);
    
    // Calculate summary statistics
    const totalMetrics = results ? Object.keys(results).length : 0;
    const passedMetrics = results ? Object.values(results).filter(r => r.passed).length : 0;
    
    const summary = {
      passRate: totalMetrics > 0 ? (passedMetrics / totalMetrics) * 100 : 0,
      passedCount: passedMetrics,
      totalCount: totalMetrics
    };

    // Create JSON output
    const output = {
      configuration: {
        default_threshold: defaultThreshold,
        metrics: metrics
      },
      summary: summary,
      result: results ? Object.entries(results).map(([metric, evalResult]) => ({
        metric,
        score: evalResult.score,
        passed: evalResult.passed,
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