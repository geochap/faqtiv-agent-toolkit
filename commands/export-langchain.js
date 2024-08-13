import * as config from '../config.js';

function generateToolDefinitions(signatures, functions) {
  const signatureMap = {};

  // Parse the signatures into a map for easy lookup
  signatures.split('\n').forEach(signature => {
    const match = signature.match(/(\w+)\(([^)]*)\):\s*([\w\s{}\[\],<>:]+)\s*-\s*(.*)/);
    if (match) {
      const [_, name, params, returnType, description] = match;
      signatureMap[name] = { params, returnType, description };
    }
  });

  return functions.map(func => {
    const { name, code } = func;
    const signature = signatureMap[name];
    
    if (signature) {
      const { params, description } = signature;
      const paramList = params.split(', ').map(param => param.split(':')[0] + ': Any').join(', ');
      
      return `@tool\ndef ${name}(${paramList}) -> Any:\n    """${description}."""\n${code.slice(code.indexOf('\n') + 1)}`;
    }
  }).join('\n');
}

export default async function exportLangchain() {
  const { instructions, libs, functions, functionsHeader, desktopInstructions } = config.project;
  const { runtimeName } = config.project.runtime;

  if (runtimeName !== 'python') {
    console.log('Langchain export is only supported for Python.');
    return;
  }

  console.log(JSON.stringify({
    tools: generateToolDefinitions(functionsHeader.signatures, functions),
    toolNames: functions.map(f => f.name),
    toolSignatures: functionsHeader.signatures,
    instructions,
    desktopInstructions,
    libs: libs.map(l => l.code).join('\n'),
    imports: [...new Set(libs.concat(functions).flatMap(f => f.imports))].join('\n')
  }, null, 2));
}