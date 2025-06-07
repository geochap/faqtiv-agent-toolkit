import { llm, stripMarkdownFences } from './openai.js';

export async function judgeWithLLM({
  question,
  expectedAnswer,
  instructions,
  code,
  toolData
}) {
  const systemPrompt = `
You are a meticulous LLM-based evaluator. Your task is to judge the correctness and instruction compliance of code based on its output, implementation, and guidance provided.

Use this JSON format:
{
  "correctness": {
    "pass": true|false|null,
    "positive": ["..."],
    "negative": ["..."]
  },
  "instruction_compliance": {
    "pass": true|false|null,
    "positive": ["..."],
    "negative": ["..."],
    "rule_violations": ["..."]
  },
  "retry_guidance": "..."
}

## Correctness must be judged based on the following criteria:

1. The returned result **must include all three top-level fields**:
   - \`dataDictionary\`
   - \`description\`
   - \`results\`

2. The \`dataDictionary\` must **not be empty**.

3. If an \`expectedAnswer\` is provided, evaluate whether the answer is:
   - **Supported by fields or values** returned in the \`results\`
   - Consistent with or traceable to the \`dataDictionary\`

4. If the expected answer includes **grading notes, justification, or logic**, check that the answer **explicitly adheres to or reflects** those notes.

## Instruction Compliance:
Check that all agent rules are followed. If any are violated, include the specific rule(s) in \`rule_violations\`.
**Important** You must have either as positive or negative statement for each numbered agent rule.

⚠️ Only include items in "negative" that must be fixed in order to pass. Do not include style or preference feedback.
`.trim();

  const codeLanguage = code.trim().startsWith('def ') ? 'python' : 'javascript';
  const toolDataStr = JSON.stringify(toolData, null, 2);

  const userPrompt = `
### Agent Instructions:
${instructions}

### Code:
\`\`\`${codeLanguage}
${code}
\`\`\`

### Tool Output:
\`\`\`json
${toolDataStr}
\`\`\`

### Evaluation Context:
Question: ${question}
Expected Answer: ${expectedAnswer || '[none provided]'}

Evaluate the result using the criteria above.
`.trim();

  const raw = await llm(systemPrompt, userPrompt, "gpt-4.1");
  const cleaned = stripMarkdownFences(raw);

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('❌ Failed to parse judge output:', cleaned);
    throw err;
  }
}
