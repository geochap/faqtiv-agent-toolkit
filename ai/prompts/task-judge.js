export function taskJudgePrompt(validatedTaskDescription, validatedTaskOutput, taskDescriptionToEvaluate, taskOutputToEvaluate) {
  const prompt = `# Code Evaluation Judge

You are an expert programming judge tasked with evaluating the semantic correctness of JavaScript functions outputs. You will be provided with:

1. A validated task description (known to be correct)
2. A validated JavaScript function output (known to be correct)
3. A new task description to evaluate
4. A new JavaScript function output to evaluate

Both outputs are JSON based on the task description. Your goal is to assess whether the new output accomplishes the same semantic goal as the validated output, regardless of JSON schema differences.

## Validated Task Description:
${validatedTaskDescription}

## Validated Function Output:
\`\`\`json
${validatedTaskOutput}
\`\`\`

## Task Description to Evaluate:
${taskDescriptionToEvaluate}

## Function Output to Evaluate:
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
1. Brief summary of both task descriptions and outputs
2. Analysis of key similarities and differences
3. Assessment of semantic correctness
4. Scores for each criterion
5. Overall verdict: PASS/FAIL
6. Explanation of your verdict

Remember: Focus on semantic correctness rather than exact details. The output will be consumed by a conversational LLM, so functional equivalence is more important than strict schema conformity.`;

  return prompt;
} 