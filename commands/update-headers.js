import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import jsdoc2md from 'jsdoc-to-markdown';
import * as config from '../config.js';
import { getTaskEmbedding } from '../controllers/code-gen.js';
import { encodeBase64 } from '../lib/base64.js';
import CodeAgent from '../ai/code-agent.js';

const functionsDir = config.project.functionsDir;
const headerPath = config.project.headerPath;
const { runtimeName, codeFileExtension } = config.project.runtime;

export default async function(options) {
  const force = options.force;
  try {
    if (!fs.existsSync(functionsDir) || fs.readdirSync(functionsDir).filter(file => file.endsWith(codeFileExtension)).length === 0) {
      console.log('No functions found, nothing to do');
      return;
    }

    if (!force) {
      let headersUpdated = headersUpToDate();

      if (headersUpdated) {
        console.log('Functions up to date, nothing to do');
        return;
      }
    }

    const functionFiles = fs.readdirSync(functionsDir).filter(file => file.endsWith(codeFileExtension));
    const fullPaths = functionFiles.map(file => path.join(functionsDir, file));
    let signatures = [];

    // Read JSDoc for javascript, skip for other runtimes
    if (runtimeName == 'javascript') {
      // If update is required, re-read all files and generate signatures
      const jsdocData = await jsdoc2md.getJsdocData({ files: fullPaths });
      signatures = jsdocData.map(data => {
        if (data.kind === 'function') {
          // Handle parameters safely
          const params = data.params.map(param => {
            const paramName = param.name;
            const paramType = param.type && param.type.names ? param.type.names.join('|') : 'any';
            return `${paramName}:${paramType}`;
          }).join(', ');

          // Safely handle return types
          let returnType = 'void'; // Default return type
          if (data.returns && data.returns.length > 0 && data.returns[0].type && data.returns[0].type.names) {
            returnType = data.returns[0].type.names.join('|');
          } else {
            returnType = 'unknown'; // Fallback if return type is not specified
          }

          // Construct the function signature string
          return `${data.name}(${params}) : ${returnType} ${data.description ? `- ${data.description}` : ''}`;
        }
        return null; // Ignore non-function kinds
      }).filter(Boolean);
    }

    const { instructions, functions, functionsHeader } = config.project;
    const codeAgent = new CodeAgent('code-gen-demo', instructions, functions, functionsHeader ? functionsHeader.signatures : '', config.openai);

    const functionsCode = fullPaths.map(file => fs.readFileSync(file, 'utf8'));
    const improvedSignatures = await codeAgent.improveFunctionSignatures(functionsCode, signatures);
    const headersEmbedding = encodeBase64(await getTaskEmbedding(improvedSignatures));

    // Write to header file
    fs.writeFileSync(headerPath, yaml.dump({
      signatures: improvedSignatures,
      embedding: headersEmbedding
    }), 'utf8');
    console.log('Function signatures header updated');
  } catch (error) {
    console.error('Error generating headers:', error);
    process.exit(1);
  }
}

function anyFileIsNewerThan(mTime, baseDir, files) {
  for (const file of files) {
    const filePath = path.join(baseDir, file);
    const fileStat = fs.statSync(filePath);
    if (fileStat.mtime > mTime) return true;
  }
}

export function headersUpToDate() {
  const headerExists = fs.existsSync(headerPath);
  const headerStat = headerExists ? fs.statSync(headerPath) : null;

  if (!headerExists) return false;

  const functions = fs.readdirSync(functionsDir).filter(file => file.endsWith(codeFileExtension));
  if (anyFileIsNewerThan(headerStat.mtime, functionsDir, functions)) return false;

  return true;
}