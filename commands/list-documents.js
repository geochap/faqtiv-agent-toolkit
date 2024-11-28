import fs from 'fs/promises';
import * as config from '../config.js';

/**
 * Lists all documentation files and their headers
 */
async function listDocuments(options) {
  try {
    const documentsHeader = config.project.documentsHeader;

    if (!documentsHeader) {
      console.log('No documents header found, please run faqtiv update-doc-header first');
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(documentsHeader, null, 2));
    } else {
      Object.entries(documentsHeader).forEach(([name, details]) => {
        console.log(`document: ${name}`);
        console.log('Description:');
        console.log(details.description);
        console.log('---');
      });
    }
  } catch (err) {
    console.error('Error listing documentation:', err);
    process.exit(1);
  }
}

export default listDocuments; 