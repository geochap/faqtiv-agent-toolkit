# Eval-Agent Command Guide

## Overview
The `eval-agent` command is a tool for evaluating agent responses using OpenEvals. It allows you to assess the quality of agent responses against various metrics and compare them with reference outputs.

## Basic Usage

```bash
faqtiv eval-agent <conversation-file>
```

### Options
- `-u, --url <url>`: URL of an existing server to use instead of starting a new one

## Conversation File Format

The conversation file should be a JSON file containing the following structure:

```json
{
  "messages": [
    {
      "role": "user",
      "content": "Your question here"
    },
    {
      "role": "assistant",
      "content": "Reference response here"
    }
  ],
  "context": "Optional context for the conversation",
  "threshold": 0.7,  // Optional default threshold for metrics
  "metrics": [       // Optional metrics configuration
    {
      "name": "correctness",
    },
    {
      "name": "conciseness",
      "threshold": 0.9
    }
  ]
}
```

## Available Metrics

The eval-agent supports several built-in metrics:

1. `correctness`: Evaluates the factual accuracy of the response
2. `conciseness`: Measures how concise and to-the-point the response is
3. `hallucination`: Checks for made-up or incorrect information
4. `rag_helpfulness`: Evaluates the helpfulness of RAG-based responses
5. `rag_groundedness`: Measures how well the response is grounded in retrieved information
6. `rag_retrieval_relevance`: Assesses the relevance of retrieved information
7. `trajectory_accuracy`: Evaluates the accuracy of agent's action trajectories

### Default Values

If no metrics are specified in the conversation file, the following defaults are used:

- `correctness` with threshold 0.7
- `conciseness` with threshold 0.7
- `hallucination` with threshold 0.7

The default threshold for all metrics is 0.7, which means:
- Scores ≥ 0.7 are considered passing
- Scores < 0.7 are considered failing

You can override these defaults by specifying your own metrics and thresholds in the conversation file.

## Custom Metrics

You can also create custom metrics by adding text files in the `agent-evals/metrics` directory. Each metric should be a text file containing the evaluation prompt.

## Output Format

The command outputs a JSON object with the following structure:

```json
{
  "configuration": {
    "default_threshold": 0.7,
    "metrics": [
      {
        "name": "correctness",
        "threshold": 0.7
      }
    ]
  },
  "summary": {
    "passRate": 100,
    "passedCount": 1,
    "totalCount": 1
  },
  "result": [
    {
      "metric": "correctness",
      "score": 0.9,
      "passed": true,
      "comment": "Detailed evaluation comment"
    }
  ]
}
```

## Conversation Processing

The eval-agent processes conversations in a specific way:

1. **Last User-Assistant Pair**: The evaluation focuses on the last user message and its corresponding assistant response(s) in the conversation. All previous messages are treated as context.

2. **Context Handling**: Previous messages are concatenated and used as context for the evaluation. This helps the evaluator understand the conversation history and make more informed judgments.

## Trajectory Accuracy Evaluation

The `trajectory_accuracy` metric is special as it evaluates the sequence of actions (tool calls) taken by the agent to reach a solution. This metric requires the conversation to include tool calls in the assistant's responses.

### Example with Tool Calls

Here's an example of a conversation file that includes tool calls for trajectory accuracy evaluation:

```json
{
  "messages": [
    {
      "role": "user",
      "content": "What is the current weather in New York?"
    },
    {
      "role": "assistant",
      "content": "Let me check the weather for you.",
      "tool_calls": [
        {
          "id": "call_1",
          "type": "function",
          "function": {
            "name": "get_weather",
            "arguments": "{\"location\": \"New York\"}"
          }
        }
      ]
    },
    {
      "role": "tool",
      "tool_call_id": "call_1",
      "content": "{\"temperature\": 72, \"condition\": \"sunny\"}"
    },
    {
      "role": "assistant",
      "content": "The current weather in New York is 72°F and sunny."
    }
  ],
  "metrics": [
    {
      "name": "trajectory_accuracy",
      "threshold": 0.8
    },
    {
      "name": "mymetric"
    }
  ]
}
```

In this example:
1. The user asks about the weather in New York
2. The assistant makes a tool call to `get_weather` with the correct location
3. The tool responds with the weather data
4. The assistant provides a final response based on the tool's output

The trajectory accuracy metric will evaluate:
- Whether the correct tool was called
- If the tool arguments were appropriate
- If the final response correctly used the tool's output
- The overall logical flow of the interaction

## Directory Structure

The eval-agent command relies on the following directory structure:

```
your-project/
└── agent-evals/     # Agent evaluation files
    ├── metrics/     # Metric definitions
    │   └── mymetric.txt
    ├── conversation1.json
    └── conversation2.json
```

### Directory Contents

1. **agent-evals/**: Contains all evaluation-related files
   - Conversation files in JSON format
   - Example: `conversation1.json` contains a conversation with messages and metrics

2. **agent-evals/metrics/**: Contains custom metric definitions
   - Each metric has a `.txt` file with its evaluation prompt
   - Example: `mymetric.txt` contains the prompt for custom evaluation


## Best Practices

1. **Context Matters**: Always provide relevant context in your conversation file when evaluating responses that depend on previous interactions.

2. **Threshold Selection**: Choose appropriate thresholds for each metric based on your requirements. Higher thresholds mean stricter evaluation.

3. **Multiple Metrics**: Use multiple metrics to get a comprehensive evaluation of the agent's performance.

4. **Reference Outputs**: Ensure your reference outputs are high-quality and accurate for meaningful evaluation.

5. **Custom Metrics**: Create custom metrics when the built-in ones don't fully capture your evaluation needs.

## Troubleshooting

1. **Server Issues**: If you encounter server-related issues, try using the `--url` option to specify an existing server.

2. **File Format**: Ensure your conversation file follows the correct JSON format and includes all required fields.

3. **Metric Configuration**: Verify that your metric names match the available metrics or your custom metric files exist.

4. **Tool Calls**: For trajectory accuracy evaluation, ensure your conversation includes tool calls in the assistant's responses.