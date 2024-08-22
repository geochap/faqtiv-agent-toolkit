import express from 'express';
import runTask from './run-task.js';
import runAdHocTask from './run-ad-hoc-task.js';
import { extractFunctionCode, getFunctionParameters } from '../lib/parse-utils.js';
import fs from 'fs';
import path from 'path';
import * as config from '../config.js';

export default function serve(options) {
  const app = express();
  const port = options.port || 8000;

  app.use(express.json());

  app.post('/run_task/:taskName', async (req, res) => {
    try {
      const { taskName } = req.params;
      const { args = {}, output, files, error } = req.body;

      // Validate and order arguments
      const taskFile = path.join(config.project.codeDir, `${taskName}${config.project.runtime.codeFileExtension}`);
      if (!fs.existsSync(taskFile)) {
        return res.status(404).json({ error: `Task "${taskName}" doesn't exist` });
      }

      const taskCode = fs.readFileSync(taskFile, 'utf8');
      const doTaskCode = extractFunctionCode(taskCode, 'doTask');
      const doTaskParameters = getFunctionParameters(doTaskCode);

      const orderedArgs = doTaskParameters.map(param => {
        if (!(param in args)) {
          return res.status(400).json({ error: `Missing required parameter: ${param}` });
        }
        return args[param];
      });

      const result = await runTask(taskName, orderedArgs, { output, files, error });
      res.json({ result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/run_adhoc', async (req, res) => {
    try {
      const { input } = req.body;
      const result = await runAdHocTask(input);
      res.json({ result });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}