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
  TRAJECTORY_ACCURACY_PROMPT
} from "agentevals";
import { setupServer, startServer, shutdownServer } from '../lib/server-manager.js';
import dotenv from 'dotenv';
import { Client } from "langsmith";
import { traceable } from "langsmith/traceable";

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
  trajectory_accuracy: TRAJECTORY_ACCURACY_PROMPT
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
      console.warn('Trajectory accuracy metric requires full conversation trajectories and cannot be evaluated in this context');
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
 * Extract content from a message, handling tool calls and tool responses
 * @param {object} message - The message object
 * @returns {string} - The message content
 */
function extractMessageContent(message) {
  if (!message) return "";
  
  // If message has tool calls, extract the description/task from them
  if (message.tool_calls) {
    return message.tool_calls
      .map(call => {
        try {
          // Parse the function arguments to get the description
          const args = JSON.parse(call.function.arguments);
          return args.description || args.prompt || "";
        } catch (e) {
          return "";
        }
      })
      .filter(content => content)
      .join("\n");
  }
  
  // For tool responses, extract the result
  if (message.role === 'tool') {
    try {
      const result = JSON.parse(message.content);
      return result.result || message.content;
    } catch (e) {
      return message.content;
    }
  }
  
  return message.content || "";
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
  const threshold = conversationData.threshold || DEFAULT_THRESHOLD;
  const metrics = conversationData.metrics || ['correctness', 'conciseness', 'hallucination'];
  
  // Create evaluators for the specified metrics
  const evaluators = createEvaluators(metrics);
  
  // Check if trajectory_accuracy is one of the metrics
  const hasTrajectoryAccuracy = metrics.some(m => m.toLowerCase() === 'trajectory_accuracy');
  
  // If trajectory_accuracy is requested, we need to evaluate the entire conversation
  if (hasTrajectoryAccuracy) {
    const trajectoryEvaluator = evaluators['trajectory_accuracy'];
    
    // Set up LangSmith tracing for the trajectory evaluator
    const client = new Client();
    const tracedFn = traceable(async () => {
      return await trajectoryEvaluator({
        outputs: conversationData.outputs
      });
    }, {
      name: "trajectory_accuracy_evaluation",
      run_type: "chain",
      client
    });
    
    // For trajectory accuracy, we just evaluate the existing conversation
    // No need to get a new response from the server
    const trajectoryResult = await tracedFn();
    
    results.push({
      trajectory_accuracy: {
        ...trajectoryResult,
        scoreDetails: calculateScore(trajectoryResult.score, threshold)
      }
    });
    
    return { results, threshold, metrics };
  }

  // Process each conversation turn
  for (let i = 0; i < conversationData.outputs.length; i++) {
    const message = conversationData.outputs[i];
    
    if (message.role === 'user') {
      // Find the corresponding assistant response(s)
      let assistantResponses = [];
      let j = i + 1;
      
      // Collect all assistant responses and tool responses until next user message
      while (j < conversationData.outputs.length && conversationData.outputs[j].role !== 'user') {
        assistantResponses.push(conversationData.outputs[j]);
        j++;
      }
      
      if (assistantResponses.length > 0) {
        // Get completion from server
        const response = await axios.post(`${serverUrl}/completions`, {
          messages: [{ role: 'user', content: message.content }]
        });

        const newResponse = response.data.choices[0].message.content;
        
        // Combine all assistant responses into a single string for evaluation
        const originalResponse = assistantResponses
          .map(msg => extractMessageContent(msg))
          .filter(content => content)
          .join("\n");
        
        // Evaluate both responses
        const evalResponse = await evaluateResponse(
          conversationData.context, 
          message.content, 
          newResponse, 
          originalResponse, 
          threshold,
          evaluators
        );

        results.push(evalResponse);
      }
      
      // Skip to the next user message
      i = j - 1;
    }
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
    const totalMessages = results.length;
    const summary = {};
    for (const metric of metrics) {
      const passedCount = results.filter(r => r[metric]?.scoreDetails.passed).length;
      summary[metric] = {
        passRate: (passedCount / totalMessages) * 100,
        passedCount,
        totalCount: totalMessages
      };
    }

    // Create JSON output
    const output = {
      configuration: {
        threshold: threshold * 100,
        metrics: metrics
      },
      summary: summary,
      results: results.map((result, index) => ({
        messageIndex: index + 1,
        metrics: Object.entries(result).map(([metric, evalResult]) => ({
          metric,
          score: evalResult.scoreDetails.percentage,
          passed: evalResult.scoreDetails.passed,
          comment: evalResult.comment
        }))
      }))
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