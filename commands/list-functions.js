import fs from 'fs/promises';
import path from 'path';
import * as config from '../config.js';

async function listFunctions(options) {
  const functions = await readFunctionsOrLibs(config.project.functionsDir, 'function');
  const libs = await readFunctionsOrLibs(config.project.libsDir, 'lib');

  const result = [...functions, ...libs];

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    result.forEach(item => {
      console.log(`${item.type}: ${item.name}`);
      console.log('Code:');
      console.log(item.code);
      console.log('---');
    });
  }
}

async function readFunctionsOrLibs(dir, type) {
  try {
    const files = await fs.readdir(dir);
    const items = await Promise.all(
      files
        .filter(file => path.extname(file) === config.project.runtime.codeFileExtension)
        .map(async (file) => {
          const filePath = path.join(dir, file);
          const code = await fs.readFile(filePath, 'utf-8');
          return { type, name: path.basename(file, path.extname(file)), code };
        })
    );
    return items;
  } catch (error) {
    console.error(`Error reading ${type}s:`, error);
    return [];
  }
}

export default listFunctions;