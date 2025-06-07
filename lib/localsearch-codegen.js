// trainOnExample.js
// Self-Improving Agent Training Loop with Canonical Question Strategy
// Core workflow to generate, execute, evaluate, and finalize agent-generated code

import { judgeWithLLM } from './llmjudge.js';
import { getEmbedding, llm } from './openai.js';
import { knnQuery, writeToSearchIndex } from './opensearch.js';

export async function trainOnExample({
  canonicalQuestion,
  expectedAnswer = null,
  codegenInstructions,
  generateCode,
  executeGeneratedCode,
  judgeCode = judgeWithLLM,
  batchSize = 4
}) {
  const MAX_ATTEMPTS = 5;
  let attempts = 0;
  let bestCandidate = null;
  let bestScore = -10000;
  let noImprovementStreak = 0;

  // Retrieve knowledge base entries once per run
  const contextDocs = await retrieveAndDigestRelevantKnowledgeBaseEntries(canonicalQuestion);

  while (attempts < MAX_ATTEMPTS && noImprovementStreak < 2) {
    console.log(`\n===== Attempt ${attempts + 1} =====`);
    const roundStart = Date.now();

    attempts++;

    const prompt = `${canonicalQuestion}`;
    const priorBestCandidate = bestCandidate || null;

    console.log(`[Round ${attempts}] Generating ${batchSize} candidates...`);
    const genStart = Date.now();
    const candidates = await Promise.all(
      Array.from({ length: batchSize }, () => generateCode(prompt, priorBestCandidate, contextDocs))
    );
    console.log(`[Round ${attempts}] Code generation took ${(Date.now() - genStart)}ms.`);

    console.log(`[Round ${attempts}] Executing and judging candidates...`);
    const evalStart = Date.now();
    const evaluatedCandidates = await Promise.all(
      candidates.map(async (candidate, i) => {
        const { code, plan, codeWithDependencies } = candidate;
        const label = `Candidate ${i + 1}`;
        try {
          const execStart = Date.now();
          const toolData = await executeGeneratedCode(codeWithDependencies);
          const execTime = Date.now() - execStart;

          const judgeStart = Date.now();
          const evalResult = await judgeCode({
            question: canonicalQuestion,
            expectedAnswer,
            instructions: codegenInstructions,
            code,
            toolData
          });
          const judgeTime = Date.now() - judgeStart;

          const score = scoreEval(evalResult);
          console.log(`[${label}] Exec time: ${execTime}ms, Judge time: ${judgeTime}ms, Score: ${score.toFixed(2)} (Best: ${bestScore.toFixed(2)})`);

          return { code, plan, evalResult, score, toolData };
        } catch (err) {
          console.warn(`[${label}] Execution failed:`, err);
          return null;
        }
      })
    );
    console.log(`[Round ${attempts}] Evaluation took ${(Date.now() - evalStart)}ms.`);

    let improved = false;

    for (const result of evaluatedCandidates) {
      if (!result) continue;

      const { code, plan, evalResult, score, toolData } = result;
      const hasFailures = Object.values(evalResult).some(dim => Array.isArray(dim.negative) && dim.negative.length > 0);

      if (!hasFailures && expectedAnswer !== null) {
        bestCandidate = { code, plan, evalResult, toolData };
        bestScore = score;
        console.log("✅ Found correct solution.");

        await saveFewShotExample({
          canonicalQuestion,
          expectedAnswer,
          code: bestCandidate.code,
          plan: bestCandidate.plan,
          instructions: codegenInstructions,
          evalResult: bestCandidate.evalResult,
          toolData: bestCandidate.toolData
        });
            
        return { bestCandidate };
      }

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = { code, plan, evalResult };
        improved = true;
      }

      logFailure(attempts, evalResult);
    }

    if (!improved) noImprovementStreak++;
    else noImprovementStreak = 0;

    console.log(`[Round ${attempts}] Round duration: ${(Date.now() - roundStart)}ms`);
  }

  if (bestCandidate && bestScore > 0 && expectedAnswer !== null && bestCandidate.evalResult?.correctness?.pass) {
    await saveFewShotExample({
      canonicalQuestion,
      expectedAnswer,
      code: bestCandidate.code,
      plan: bestCandidate.plan,
      instructions: codegenInstructions,
      evalResult: bestCandidate.evalResult,
      toolData: bestCandidate.toolData
    });
    console.log("✔️ Training example saved.");
  } else {
    console.warn("❌ Failed to generate a passing candidate after maximum attempts.");
  }

  return { bestCandidate };
}

function scoreEval(evalResult) {
  const weights = {
    correctness: 5,
    instruction_compliance: 3
  };

  return Object.entries(evalResult).reduce((score, [key, dim]) => {
    const weight = weights[key] || 1;

    const positives = Array.isArray(dim.positive) ? dim.positive.length : 0;
    const negatives = Array.isArray(dim.negative) ? dim.negative.length : 0;

    const bonus = positives * 0.25 * weight;
    const penalty = negatives * 0.25 * weight;

    if (dim.pass === true) return score + weight + bonus;
    if (dim.pass === false) return score - penalty;

    return score + bonus - penalty;
  }, 0);
}

function logFailure(attempt, evalResult) {
  console.warn(`Attempt ${attempt} failed:`);
  for (const [dim, result] of Object.entries(evalResult)) {
    if (!result.pass && Array.isArray(result.negative)) {
      console.warn(` - ${dim}: ❌ ${result.negative.join(' ')}`);
    }
  }
}


async function saveFewShotExample({ canonicalQuestion, code, plan, instructions, evalResult, toolData }) {
  const codeLanguage = code.trim().startsWith('def ') ? 'python' : 'javascript';
  const toolDataStr = JSON.stringify(toolData, null, 2);

  const descriptionPrompt = `
  You are indexing a function by writing a concise description of what arguments it takes, what it returns and how it's structured, suitable for semantic retrieval.
  
  Use the following instructions:
  
  1. **Start the description with heading that is a generalized version of the user question**, replacing any specific names, identifiers, or dates with abstract placeholders like [entity], [year], [period], etc.
  2. Then provide a plain English description of **what the function takes for arguments** and **what the function returns**, using both:
     - The **code**, which shows what is selected, grouped, or constructed
     - The **structured tool output**, which shows the resulting shape and field content
  3. Include:
     - Whether it returns results for one or many entities
     - One or multiple time periods
     - All named fields or groupings
  4. **Do not include** 
    - the raw JSON
    - detailed description of the logic or implementation
  5. Output concise markdown-friendly sentences only.
  
  ### User Question:
  ${canonicalQuestion}
  
  ### Code:
  \`\`\`${codeLanguage}
  ${code}
  \`\`\`
  
  ### Tool Output:
  \`\`\`json
  ${toolDataStr}
  \`\`\`
  `;

  const description = (await llm('You are a metadata summarizer.', descriptionPrompt)).trim();

  await writeToSearchIndex(process.env.OPENSEARCH_TASK_INDEX, undefined, {
    task: description,
    code: code,
    taskEmbedding: await getEmbedding(description),
    evalResult,
    dataDictionary: toolData?.dataDictionary
  });
}
 
async function retrieveAndDigestRelevantKnowledgeBaseEntries(canonicalQuestion) {
  const embedding = await getEmbedding(canonicalQuestion);
  const kbResults = await knnQuery(
    process.env.OPENSEARCH_KB_INDEX,
    'embedding',
    embedding,
    20,
    ['text']
  );
  const kbContext = kbResults.map(res => `${res.text}`).join('\n---\n');

  const digestPrompt = `You are a helpful assistant. You have retrieved the following context in response to the user question below. Summarize what information from the context might help a code generator decide how to answer the question. If there are multiple relevant paths, describe each. Be concise but precise. 
  Always list all relevant field names and field group names since knowing these names will improve the code generation process.
  If you list a field group name, also list the field names inside it since this will help the code generator document the returned data structure.

### Question:
${canonicalQuestion}

### Retrieved Context:
${kbContext}

### Digest:`;
  const digestRaw = await llm("You are a code-oriented summarizer.", digestPrompt);
  return digestRaw.trim();
}
