const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const serverless = require('serverless-http');
const { generateAndExecuteAdhoc, captureAndProcessOutput } = require('./tools');
const { logErr, log } = require('./logger');
const { generateCompletion, streamCompletion } = require('./completions');
const { TASK_NAME_TO_FUNCTION_NAME_MAP, TASKS, IS_LAMBDA } = require('../constants');

function validateCompletionMessages(messages) {
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return { 
      isValid: false, 
      error: 'Messages field must be provided and contain at least one message' 
    };
  }
  return { isValid: true };
}

const app = express();
app.use(bodyParser.json({
  limit: '10mb'
}));

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

  if (typeof TASKS[validTaskName] !== 'function') {
    logErr('run_task', taskName, req.body, 'Not found');
    return res.status(404).json({ error: `Task '${taskName}' not found` });
  }

  // todo: make sure the args are in the correct positional order
  try {
    const result = await captureAndProcessOutput(TASKS[validTaskName], Object.values(args));
    res.json({ result });
  } catch (error) {
    logErr('run_task', taskName, { id: requestId, ...req.body }, error);
    res.status(500).json({ error: error.message });
  }
});

function createEventWriter(completionId, responseWriter) {
  return async function emitEvent(data, model) {
    const eventChunk = {
      id: completionId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, delta: { role: 'assistant', content: `\n\`\`\`agent-message\n${data}\n\`\`\`\n` }, finish_reason: null }],
    };
    responseWriter(`data: ${JSON.stringify(eventChunk)}\n\n`);
  };
}

function createRawWriter(completionId, responseWriter) {
  return async function emitEvent(data, model) {
    const chunk = {
      id: completionId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, delta: { role: 'assistant', content: `${data}` }, finish_reason: null }],
    };
    responseWriter(`data: ${JSON.stringify(chunk)}\n\n`);
  };
}

app.post('/completions', async (req, res) => {
  try {
    const { 
      messages, 
      include_tool_messages,
      max_tokens,
      temperature
    } = req.body;

    const validation = validateCompletionMessages(messages);
    if (!validation.isValid) {
      logErr('completions', 'invalid-request', req.body, validation.error);
      return res.status(400).json({ error: validation.error });
    }

    const completionId = `cmpl-${uuidv4()}`;
    const logBody = {
      id: completionId,
      prompt: messages.length > 0 ? messages[messages.length - 1].content : "",
      messageCount: messages.length, 
      include_tool_messages, 
      max_tokens, 
      temperature 
    };
    log('completions', 'request', logBody);

    console.log("Completion request: ", messages.length > 0 ? messages[messages.length - 1].content : "");

    if (req.headers.accept?.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Keep-Alive', 'timeout=900');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Transfer-Encoding', 'chunked');

      try {
        const streamWriter = {
          writeEvent: createEventWriter(completionId, data => res.write(data)),
          writeRaw: createRawWriter(completionId, data => res.write(data)),
        };

        for await (const chunk of streamCompletion(completionId, messages, {includeToolMessages:include_tool_messages, maxTokens:max_tokens, temperature}, streamWriter)) {
          const data = `data: ${JSON.stringify(chunk)}\n\n`;
          res.write(data);
        }
        // Send final DONE message
        const doneData = 'data: [DONE]\n\n';
        res.write(doneData);
        res.end();
        log('completions', 'done', { id: completionId, status: 'done' });
      } catch (error) {
        logErr('completions', 'internal-server-error', logBody, error);
        res.status(500).json({ error: error.message });
      }
      return;
    }

    try {
      const result = await generateCompletion(completionId, messages, {include_tool_messages, maxTokens:max_tokens, temperature});
      res.json(result);
      log('completions', 'done', { id: completionId, status: 'done' });
    } catch (error) {
      logErr('completions', 'internal-server-error', logBody, error);
      res.status(500).json({ error: error.message });
    }
  } catch (error) {
    logErr('completions', 'internal-server-error', logBody, error);
    res.status(500).json({ error: error.message });
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

function getLambdaBody(event) {
  const bodyString = event.isBase64Encoded 
    ? Buffer.from(event.body, 'base64').toString('utf-8')
    : event.body;
  return JSON.parse(bodyString);
}

const serverlessApp = serverless(app);
const lambdaHandler = IS_LAMBDA ? awslambda.streamifyResponse(async (event, responseStream, context) => {
  // Check if it's a streaming request
  const isCompletionsRequest = (event.path === '/completions' || event.rawPath === '/completions');
  const isStreamingRequest = event.headers?.accept?.includes('text/event-stream');
  
  if (isCompletionsRequest && isStreamingRequest) {
    const httpResponseMetadata = {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Transfer-Encoding': 'chunked',
        'Keep-Alive': 'timeout=900'
      }
    };

    responseStream = awslambda.HttpResponseStream.from(
      responseStream,
      httpResponseMetadata
    );
    
    try {
      const { messages, include_tool_messages, max_tokens, temperature } = getLambdaBody(event);

      const validation = validateCompletionMessages(messages);
      if (!validation.isValid) {
        responseStream.write(JSON.stringify({ error: validation.error }));
        responseStream.end();
        return;
      }

      const completionId = `cmpl-${uuidv4()}`;
      const logBody = {
        id: completionId,
        prompt: messages.length > 0 ? messages[messages.length - 1].content : "",
        messageCount: messages.length,
        include_tool_messages, 
        max_tokens, 
        temperature 
      };
      
      log('completions', 'stream', logBody);

      const streamWriter = {
        writeEvent: createEventWriter(completionId, data => res.write(data)),
        writeRaw: createRawWriter(completionId, data => res.write(data)),
      };

      for await (const chunk of streamCompletion(completionId, messages, {includeToolMessages:include_tool_messages, maxTokens:max_tokens, temperature}, streamWriter)) {
        const data = `data: ${JSON.stringify(chunk)}\n\n`;
        responseStream.write(data);
      }

      log('completions', 'done', { id: completionId, status: 'done' });
      
      // Send final DONE message
      responseStream.write('data: [DONE]\n\n');
      responseStream.end();
    } catch (error) {
      logErr('completions', 'completions', event.body, error);
      responseStream.write(JSON.stringify({ error: error.message }));
      responseStream.end();
    }
    
    return;
  }
  
  // Handle other requests normally
  try {
    const response = await serverlessApp(event, context);
    
    if (!response.body) {
      logErr('lambda', 'empty-response', { event, response }, 'Received empty response body');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Empty response from server' }),
        headers: {
          'Content-Type': 'application/json'
        }
      };
    }
    
    // Log the response
    log('lambda', 'response', { statusCode: response.statusCode, path: event.path || event.rawPath });

    const httpResponseMetadata = {
      statusCode: response.statusCode,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    responseStream = awslambda.HttpResponseStream.from(
      responseStream,
      httpResponseMetadata
    );

    responseStream.write(response.body);
    responseStream.end();
  } catch (error) {
    logErr('lambda', 'server-error', { event }, error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
      headers: {
        'Content-Type': 'application/json'
      }
    };
  }
}) : null;

module.exports = {
  startHttpServer,
  lambdaHandler
};