import fs from 'fs';
import path from 'path';
import * as config from '../config.js';

export default function addDocument(name, content) {
  const docsDir = config.project.docsDir;

  // Ensure docs directory exists
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  // Handle file extension: use .txt if no extension provided, otherwise keep original
  const fileName = path.extname(name) ? name : `${name}.txt`;
  const filePath = path.join(docsDir, fileName);

  // Check if file already exists
  if (fs.existsSync(filePath)) {
    console.error(`Error: Document '${fileName}' already exists`);
    process.exit(1);
  }

  try {
    // Write the document file
    fs.writeFileSync(filePath, content);
    console.log(`Successfully added document: ${fileName}, please run faqtiv update-doc-headers to update the documentation headers`);
  } catch (error) {
    console.error(`Error adding document: ${error.message}`);
    process.exit(1);
  }
} 