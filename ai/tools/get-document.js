import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import * as config from '../../config.js';

export const getDocumentTool = new DynamicStructuredTool({
  name: 'get_document',
  description: 'Read a document from the docs directory',
  schema: z.object({
    name: z.string().describe('The name of the document to read'),
  }),
  func: async ({ name }) => {
    try {
      if (!name) {
        throw new Error('Name is required');
      }

      console.log(`Getting document with name: ${name}`);
      const filePath = path.join(config.project.docsDir, name);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Document ${name} not found`);
      }
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      throw new Error(`Error reading document: ${error.message}`);
    }
  },
  returnDirect: false,
});
