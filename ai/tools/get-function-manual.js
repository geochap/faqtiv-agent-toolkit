import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import * as config from '../../config.js';

export const getFunctionManualTool = new DynamicStructuredTool({
  name: 'get_function_manual',
  description: 'Read a function manual',
  schema: z.object({
    name: z.string().describe('The name of the function'),
  }),
  func: async ({ name }) => {
    try {
      if (!name) {
        throw new Error('Name is required');
      }

      console.log(`Getting function manual with name: ${path.join(config.project.functionManualsDir, `${name}.md`)}`);
      const filePath = path.join(config.project.functionManualsDir, `${name}.md`);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Function manual ${name}.md not found`);
      }
      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      throw new Error(`Error reading function manual: ${error.message}`);
    }
  },
  returnDirect: false,
});
