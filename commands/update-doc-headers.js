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
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(docHeaderPath, yaml.dump({}), 'utf8');
      console.log('Documentation directory does not exist, skipping documentation update');
      return;
    }

    if (fs.readdirSync(docsDir).length === 0) {
      console.log('No documentation files found, skipping documentation update');
      return;
    }

    if (!force && docHeadersUpToDate()) {
      console.log('Documentation headers up to date, skipping documentation update');
      return;
    }

    const docFiles = fs.readdirSync(docsDir);
    const docsAgent = new DocsAgent('update-doc-headers', config.openai);
    const existingIndex = config.project.documentsHeader;

    const filesToProcess = force ? docFiles : docFiles.filter(file => {
      const headerStat = fs.existsSync(docHeaderPath) ? fs.statSync(docHeaderPath) : null;
      const filePath = path.join(docsDir, file);
      return !headerStat || fs.statSync(filePath).mtime > headerStat.mtime;
    });

    const docIndex = force ? {} : { ...existingIndex };
    
    for (const file of filesToProcess) {
      const fullPath = path.join(docsDir, file);
      const docContent = fs.readFileSync(fullPath, 'utf8');
      const description = await docsAgent.generateDocDescription(file, docContent);
      
      docIndex[file] = {
        description
      };
      
      console.log(`Processed ${file}`);
    }

    fs.writeFileSync(docHeaderPath, yaml.dump(docIndex), 'utf8');
    
    console.log(`Documentation index header updated (${filesToProcess.length} files processed)`);
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