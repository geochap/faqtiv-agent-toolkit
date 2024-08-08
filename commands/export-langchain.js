import ExportAgent from '../ai/export-agent.js';
import * as config from '../config.js';

export default async function exportLangchain() {
  const { instructions, libs, functions, functionsHeader } = config.project;

  const exportAgent = new ExportAgent('langchain-export', config.openai);
  const result = await exportAgent.exportLangchainAgent(
    instructions,
    libs,
    functions,
    functionsHeader.signatures
  );

  console.log(result);
}