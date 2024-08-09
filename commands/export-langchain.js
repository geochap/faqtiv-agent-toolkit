import ExportAgent from '../ai/export-agent.js';
import * as config from '../config.js';

export default async function exportLangchain() {
  const { instructions, libs, functions, functionsHeader, desktopInstructions } = config.project;
  const { runtimeName } = config.project.runtime;

  if (runtimeName !== 'python') {
    console.log('Langchain export is only supported for Python.');
    return;
  }

  const exportAgent = new ExportAgent('langchain-export', config.openai);
  const tools = await exportAgent.exportLangchainTools(
    functions,
    functionsHeader.signatures
  );

  console.log(JSON.stringify({
    tools,
    toolNames: functions.map(f => f.name),
    toolSignatures: functionsHeader.signatures,
    instructions,
    desktopInstructions,
    libs: libs.map(l => l.code).join('\n'),
    imports: [...new Set(libs.concat(functions).flatMap(f => f.imports))].join('\n')
  }, null, 2));
}