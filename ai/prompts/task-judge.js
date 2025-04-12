export function taskJudgePrompt(validatedTaskDescription, validatedTaskOutput, taskDescriptionToEvaluate, taskOutputToEvaluate) {
  const prompt = `# Code Evaluation Judge

You are an expert programming judge tasked with evaluating the semantic correctness of task outputs. You will be provided with:

1. A validated task description (known to be correct)
2. A validated task output (known to be correct)
3. A new task description to evaluate
4. A new task output to evaluate

Both outputs are JSON based on the task description. Your goal is to assess whether the new output accomplishes the same semantic goal as the validated output, regardless of JSON schema differences.

## Validated Task Description:
${validatedTaskDescription}

## Validated Task Output:
\`\`\`json
${validatedTaskOutput}
\`\`\`

## Task Description to Evaluate:
${taskDescriptionToEvaluate}

## Task Output to Evaluate:
\`\`\`json
${taskOutputToEvaluate}
\`\`\`

## Evaluation Instructions:
1. Analyze both task descriptions to understand their core logic
2. Focus on semantic correctness - does the new output accomplish the same goal?
3. Ignore minor differences in:
   - Property naming (if semantically equivalent)
   - Output formatting or structure (if the data conveyed is equivalent)

## Scoring Criteria:
- Correctness (0-5): Does the new task description and output produce semantically correct results?
- Completeness (0-5): Does it handle all aspects of the task?
- Robustness (0-5): Would it handle edge cases appropriately?

## Your Response Format:
Provide your response in two parts:

1. **Brief Analysis (text):** A short introduction and overview of your evaluation.

2. **JSON Evaluation (strictly formatted JSON):** After your brief introduction, provide a JSON object with the following structure:
\`\`\`json
{
  "summary": {
    "validated_task": "Brief summary of the validated task description and output",
    "evaluated_task": "Brief summary of the task being evaluated and its output"
  },
  "analysis": {
    "similarities": "Key similarities between the two implementations",
    "differences": "Key differences between the two implementations"
  },
  "semantic_correctness": "Assessment of whether the new implementation is semantically correct",
  "scores": {
    "correctness": 0-5,
    "completeness": 0-5,
    "robustness": 0-5
  },
  "overall_score": 0-15,
  "verdict": "PASS" or "FAIL",
  "explanation": "Brief explanation of verdict"
}
\`\`\`

Make sure the JSON evaluation section is valid, properly formatted JSON that can be parsed programmatically.

Remember: Focus on semantic correctness rather than exact details. The output will be consumed by a conversational LLM, so functional equivalence is more important than strict schema conformity.`;

  return prompt;
} 