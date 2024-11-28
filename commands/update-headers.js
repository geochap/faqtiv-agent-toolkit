import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import jsdoc2md from 'jsdoc-to-markdown';
import { docHeadersUpToDate } from './update-doc-headers.js';
import * as config from '../config.js';
import { getTaskEmbedding } from '../controllers/code-gen.js';
import { encodeBase64 } from '../lib/base64.js';
import CodeAgent from '../ai/code-agent.js';
import { readFunctionFile } from '../lib/parse-utils.js';
import DocsAgent from '../ai/docs-agent.js';

const functionsDir = config.project.functionsDir;
const headerPath = config.project.headerPath;
const docHeaderPath = config.project.docsHeaderPath;
const functionManualsDir = config.project.functionManualsDir;
const { runtimeName, codeFileExtension } = config.project.runtime;

export default async function(options) {
  const force = options.force;
  try {
    if (!fs.existsSync(functionsDir) || fs.readdirSync(functionsDir).filter(file => file.endsWith(codeFileExtension)).length === 0) {
      console.log('No functions found, nothing to do');
      return;
    }

    const docsUpdated = docHeadersUpToDate();
    if (!docsUpdated) {
      console.log('Documentation headers not up to date, please run faqtiv update-doc-headers first');
      return;
    }

    const headersUpdated = headersUpToDate();
    const functionFiles = fs.readdirSync(functionsDir).filter(file => file.endsWith(codeFileExtension));
    const functionsFilesToUpdateManual = getFunctionsNeedingManualUpdate(functionFiles);
    
    if (!force && headersUpdated && functionsFilesToUpdateManual.length === 0) {
      console.log('Functions and documentation up to date, nothing to do');
      return;
    }

    if (force || !headersUpdated) {
      const { instructions, functions, functionsHeader, documentsHeader } = config.project;
      const fullPaths = functionFiles.map(file => path.join(functionsDir, file));
      const codeAgent = new CodeAgent(
        'update-headers', 
        instructions, 
        functions, 
        functionsHeader ? functionsHeader.signatures : '', 
        documentsHeader, 
        config.openai
      );
      const existingSignatures = functionsHeader ? functionsHeader.signatures : {};

      let newSignatures = {};
      // force will update all files, otherwise only files that have changed
      const filesToProcess = force ? fullPaths : fullPaths.filter(file => {
        const headerStat = fs.existsSync(headerPath) ? fs.statSync(headerPath) : null;
        return !headerStat || fs.statSync(file).mtime > headerStat.mtime;
      });

      let rawSignatures = {};

      if (runtimeName == 'javascript' && filesToProcess.length > 0) {
        const jsdocData = await jsdoc2md.getJsdocData({ files: filesToProcess });
        
        jsdocData.forEach(data => {
          if (data.kind === 'function') {
            const params = data.params.map(param => {
              const paramName = param.name;
              const paramType = param.type && param.type.names ? param.type.names.join('|') : 'any';
              return `${paramName}:${paramType}`;
            }).join(', ');

            let returnType = 'void';
            if (data.returns && data.returns.length > 0 && data.returns[0].type && data.returns[0].type.names) {
              returnType = data.returns[0].type.names.join('|');
            } else {
              returnType = 'unknown';
            }

            rawSignatures[data.name] = `${data.name}(${params}) : ${returnType} ${data.description ? `- ${data.description}` : ''}`;
          }
        });
      }

      for (const file of filesToProcess) {
        const fileContent = fs.readFileSync(file, 'utf8');
        const { functions } = readFunctionFile(fileContent);

        for (const { name: functionName, code: functionCode } of functions) {
          const rawSignature = rawSignatures[functionName] || '';
          const improvedSignature = await codeAgent.improveFunctionSignature(functionCode, rawSignature);
          newSignatures[functionName] = improvedSignature;
        }
      }

      const finalSignatures = force ? newSignatures : { ...existingSignatures, ...newSignatures };

      const headersEmbedding = encodeBase64(await getTaskEmbedding(Object.values(finalSignatures)));

      fs.writeFileSync(headerPath, yaml.dump({
        signatures: finalSignatures,
        embedding: headersEmbedding
      }), 'utf8');
      
      console.log(`Function signatures header updated (${filesToProcess.length} files processed)`);
    } else {
      console.log('Function signatures header up to date');
    }

    await updateFunctionManuals(functionsFilesToUpdateManual);
  } catch (error) {
    console.error('Error generating headers:', error);
    process.exit(1);
  }
}

async function updateFunctionManuals(functionsFiles) {
  console.log('Checking for function documentation to update...');

  if (functionsFiles.length > 0) {
    console.log(`Found ${functionsFiles.length} functions files needing documentation updates`);

    const docsAgent = new DocsAgent('update-headers', config.openai);

    let totalManuals = 0;
    for (const file of functionsFiles) {
      const fileContent = fs.readFileSync(path.join(functionsDir, file), 'utf8');
      const { functions } = readFunctionFile(fileContent);

      totalManuals += functions.length;
      for (const { name, code } of functions) {
        console.log(`Generating manual for ${name}`);
        const manual = await docsAgent.generateFunctionManual(code, config.project.documentsHeader);
        const manualPath = path.join(functionManualsDir, `${name}.md`);
        fs.writeFileSync(manualPath, manual, 'utf8');
      }
    }
    console.log(`Function documentation updated, wrote ${totalManuals} manuals`);
  } else {
    console.log('No functions need documentation update');
  }
}

function getFunctionsNeedingManualUpdate(functionFiles) {
  if (!fs.existsSync(functionManualsDir)) {
    fs.mkdirSync(functionManualsDir, { recursive: true });
    return functionFiles;
  }

  if (!fs.existsSync(docHeaderPath)) {
    return functionFiles;
  }

  return functionFiles.filter(file => {
    const functionPath = path.join(functionsDir, file);
    const functionStat = fs.statSync(functionPath);
    const baseName = path.basename(file, codeFileExtension);
    const manualPath = path.join(functionManualsDir, `${baseName}.md`);
    
    if (!fs.existsSync(manualPath)) {
      return true;
    }

    const manualStat = fs.statSync(manualPath);
    return manualStat.mtime < functionStat.mtime;
  });
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