const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const { generateAndExecuteAdhoc, captureAndProcessOutput } = require('./tools');
const { logErr, log } = require('./logger');
const { generateCompletion, streamCompletion } = require('./completions');
const { TASK_NAME_TO_FUNCTION_NAME_MAP } = require('../constants');

const app = express();
app.use(bodyParser.json({limit: '10mb'}));

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  next();
});

app.post('/run_adhoc', async (req, res) => {
  const requestId = `run-adhoc-${uuidv4()}`;
  log('run_adhoc', 'run_adhoc', { id: requestId, ...req.body });

  try {
    const { input } = req.body;
    let result = await generateAndExecuteAdhoc(input);

    try {
      result = JSON.parse(result);
    } catch (e) {}

    res.json({ result });
  } catch (error) {
    logErr('run_adhoc', 'run_adhoc', { id: requestId, ...req.body }, error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/run_task/:taskName', async (req, res) => {
  const { taskName } = req.params;
  const args = req.body.args || {};
  const requestId = `run-task-${uuidv4()}`;

  log('run_task', taskName, { id: requestId, ...req.body });

  const validTaskName = TASK_NAME_TO_FUNCTION_NAME_MAP[taskName] || taskName;

  if (typeof taskFunctions[validTaskName] !== 'function') {
    logErr('run_task', taskName, req.body, 'Not found');
    return res.status(404).json({ error: `Task '${taskName}' not found` });
  }

  // todo: make sure the args are in the correct positional order
  try {
    const result = await captureAndProcessOutput(taskFunctions[validTaskName], Object.values(args));
    res.json({ result });
  } catch (error) {
    logErr('run_task', taskName, { id: requestId, ...req.body }, error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/completions', async (req, res) => {
  const { 
    stream, 
    messages, 
    include_tool_messages,
    max_tokens,
    temperature
  } = req.body;
  const completionId = `cmpl-${uuidv4()}`;
  const logBody = {
    id: completionId,
    stream,
    prompt: messages.length > 0 ? messages[messages.length - 1].content : "",
    messageCount: messages.length, 
    include_tool_messages, 
    max_tokens, 
    temperature 
  };
  log('completions', 'completions', logBody);

  console.log("Completion request: ", messages.length > 0 ? messages[messages.length - 1].content : "");

  if (stream) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    for await (const chunk of streamCompletion(completionId, messages, include_tool_messages, max_tokens, temperature)) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } else {
    try {
      const result = await generateCompletion(completionId, messages, include_tool_messages, max_tokens, temperature);
      res.json(result);
    } catch (error) {
      logErr('completions', 'completions', logBody, error);
      res.status(500).json({ error: error.message });
    }
  }
});

function shutdownServer(server) {
  return new Promise((resolve) => {
    server.close(() => {
      console.log('Server shut down gracefully');
      resolve();
    });
  });
}

function startHttpServer() {
  const port = process.env.PORT || 8000;
  const shutdownKey = process.env.SHUTDOWN_KEY;

  const server = http.createServer(app);

  if (shutdownKey) {
    app.post('/shutdown', (req, res) => {
      const { key } = req.body;

      console.log('Received shutdown request');

      if (key === shutdownKey) {
        res.status(200).send('Shutting down server');
        shutdownServer(server).then(() => {
          process.exit(0);
        });
      } else {
        res.status(403).send('Invalid shutdown key');
      }
    });
  }

  server.listen(port, () => {
    console.log(`HTTP server running on port ${port}`);
  });
}

module.exports = {
  startHttpServer
};