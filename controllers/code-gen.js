import { v4 as uuidv4 } from 'uuid';
import CodeAgent from '../ai/code-agent.js';
import * as config from '../config.js';
import OpenAIModel from '../ai/models/openai.js';

async function getNearestExamples(vectorStore, taskEmbedding, functionsEmbedding, taskWeight = 0.8, functionWeight = 0.2) {
  const taskResults = await vectorStore.searchByTask(taskEmbedding, 10);
  const functionResults = await vectorStore.searchByFunctionsHeader(functionsEmbedding, 10);

  // Create a map where the key is `pageContent.id` from function results
  const functionResultsMap = new Map(
    functionResults.map(d => [JSON.parse(d[0].pageContent).id, d[1]])
  );

  // Combine scores and sort results based on `pageContent.id`
  let combinedResults = taskResults.map(d => {
    const taskScore = d[1];
    const pageContent = JSON.parse(d[0].pageContent);
    const functionScore = functionResultsMap.get(pageContent.id) || 0;

    // Calculate combined score
    const combinedScore = taskWeight * taskScore + functionWeight * functionScore;

    return {
      pageContent: pageContent,
      combinedScore: combinedScore
    };
  });

  // Sort results by combinedScore in descending order
  combinedResults.sort((a, b) => b.combinedScore - a.combinedScore);

  return combinedResults.map(d => d.pageContent);
}


export async function getTaskEmbedding(task) {
  const openai = new OpenAIModel(config.openai);
  
  return await openai.getVector(task);
}

const commentTokenByRuntime = {
  javascript: {
    opening: '/**',
    middle: '*',
    closing: ' */'
  },
  python: {
    opening: '##',
    middle: '#',
    closing: '##',
  }
}

function formatCode(libs, functions, code) {
  const { opening, middle, closing } = commentTokenByRuntime[config.project.runtime.runtimeName];
  
  // gather all dependency imports and remove duplicates
  const seen = new Set();
  const imports = [
    ...functions.map(f => f.imports),
    ...libs.map(l => l.imports)
  ]
  .flat()
  .filter(imp => {
    // naive approach of just replacing all whitespace and comparing import lines
    const normalized = imp.replace(/\s+/g, '');
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });

  let formattedCode = '';

  if (libs.length > 0 || functions.length > 0) {
    formattedCode += `${opening}
${middle} DEPENDENCIES
${middle} Warning: these are extracted from your function files, if you need to make changes edit the function file and recompile this task.
${closing}

${imports.join('\n')}
    `;
  }

  if (libs.length > 0) {
    formattedCode += `
${opening}
${middle} LIBRARY FUNCTIONS
${middle} Warning: these are common functions, if you need to make changes edit the function file and recompile this task.
${closing}

${libs.map((f) => f.code).join('\n\n')}`;
  }

  if (functions.length > 0) {
    formattedCode += `
${opening}
${middle} PUBLIC FUNCTIONS
${middle} Warning: these are common functions, if you need to make changes edit the function file and recompile this task.
${closing}

${functions.map((f) => f.code).join('\n\n')}`;
  }

  formattedCode += `
${opening}
${middle} GENERATED CODE
${middle} This function is the generated code: it's safe to edit.
${closing}

${code}`;

  return formattedCode;
}

// adhoc means the code should be self executing with hardcoded params
export async function generateResponse(taskName, vectorStore, conversation) {
  const { instructions, functions, libs, functionsHeader } = config.project;
  // generate embedding of latest user message and do a similarity search for examples
  const embedding = await getTaskEmbedding(conversation[conversation.length - 1].message);
  const examples = await getNearestExamples(vectorStore, embedding, functionsHeader.embedding);

  const aiAgent = new CodeAgent('code-gen', instructions, functions, functionsHeader.signatures, config.openai);
  const response = await aiAgent.generateResponse(conversation, examples);
  const taskSchema = await aiAgent.generateTaskSchema(taskName, response.code);

  response.code = formatCode(libs, functions, response.code);
  response.task_schema = taskSchema;

  return { 
    id: uuidv4(),
    output: response,
    embedding, 
    functions_embedding: functionsHeader.embedding 
  };
}

export async function generateAdHocResponse(vectorStore, conversation, retryCount = 0, retryErrors = [], previousCode = null) {
  const { instructions, functions, libs, functionsHeader } = config.project;
  const embedding = await getTaskEmbedding(conversation[conversation.length - 1].message);
  const examples = await getNearestExamples(vectorStore, embedding, functionsHeader.embedding);

  const aiAgent = new CodeAgent('code-gen', instructions, functions, functionsHeader.signatures, config.openai);
  
  if (retryCount > 0) {
    let retryMessage = `
      This is retry attempt ${retryCount}.
      Previous errors: ${retryErrors.join('\n\n')}.
    `;

    if (previousCode) {
      retryMessage += `
      Previous code:
      \`\`\`
      ${previousCode}
      \`\`\`
      `;
    }

    retryMessage += `
      Please address these issues in your response and improve upon the previous code if provided.
    `;

    conversation.push({ role: 'system', message: retryMessage });
  }

  const response = await aiAgent.generateResponse(conversation, examples, true);
  response.code = formatCode(libs, functions, response.code);

  return { 
    id: uuidv4(),
    output: response,
    embedding, 
    functions_embedding: functionsHeader.embedding 
  };
}

export async function generateTaskSchema(doTaskCode, taskName) {
  const { instructions, functions, functionsHeader } = config.project;
  const aiAgent = new CodeAgent('code-gen', instructions, functions, functionsHeader.signatures, config.openai);
  
  const response = await aiAgent.generateTaskSchema(taskName, doTaskCode);

  return response;
}