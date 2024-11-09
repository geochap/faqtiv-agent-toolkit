import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import * as config from '../config.js';
import DocsAgent from '../ai/docs-agent.js';

const docsDir = config.project.docsDir;
const docHeaderPath = config.project.docsHeaderPath;

export default async function(options) {
  const force = options.force;
  try {
    if (!fs.existsSync(docsDir) || fs.readdirSync(docsDir).length === 0) {
      console.log('No documentation files found, nothing to do');
      return;
    }

    if (!force && docHeadersUpToDate()) {
      console.log('Documentation headers up to date, nothing to do');
      return;
    }

    const docFiles = fs.readdirSync(docsDir);
    const docsAgent = new DocsAgent('update-doc-headers', config.openai);
    const docIndex = {};
    
    for (const file of docFiles) {
      const fullPath = path.join(docsDir, file);
      const docContent = fs.readFileSync(fullPath, 'utf8');

      // Generate description for single document
      const description = await docsAgent.generateDocDescription(file, docContent);
      
      docIndex[file] = {
        description
      };
      
      console.log(`Processed ${file}`);
    }

    fs.writeFileSync(docHeaderPath, yaml.dump(docIndex), 'utf8');
    
    console.log('Documentation index header updated');
  } catch (error) {
    console.error('Error generating doc headers:', error);
    process.exit(1);
  }
}

function anyFileIsNewerThan(mTime, baseDir, files) {
  for (const file of files) {
    const filePath = path.join(baseDir, file);
    const fileStat = fs.statSync(filePath);
    if (fileStat.mtime > mTime) return true;
  }
  return false;
}

export function docHeadersUpToDate() {
  const headerExists = fs.existsSync(docHeaderPath);
  const headerStat = headerExists ? fs.statSync(docHeaderPath) : null;

  if (!headerExists) return false;

  const docs = fs.readdirSync(docsDir);
  if (anyFileIsNewerThan(headerStat.mtime, docsDir, docs)) return false;

  return true;
} 