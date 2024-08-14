import * as config from '../config.js';

export default async function exportLangchain() {
  const { instructions, libs, functions, functionsHeader, desktopInstructions } = config.project;
  const { runtimeName } = config.project.runtime;

  if (runtimeName !== 'python') {
    console.log('Langchain export is only supported for Python.');
    return;
  }

  console.log(JSON.stringify({
    tool_schemas: functionsHeader.function_tool_schemas,
    instructions,
    desktopInstructions,
    functions: functions.map(f => f.code).join('\n'),
    libs: libs.map(l => l.code).join('\n'),
    imports: [...new Set(libs.concat(functions).flatMap(f => f.imports))].join('\n')
  }, null, 2));
}