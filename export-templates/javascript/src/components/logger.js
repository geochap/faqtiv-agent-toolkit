const fs = require('fs');
const path = require('path');
const { mkdirpSync } = require('mkdirp');
const log4js = require('log4js');
const logDir = path.join(process.cwd(), 'logs');
const logsFilePath = `${logDir}/app.log`;
const errorLogsFilePath = `${logDir}/err.log`;

const IS_LAMBDA = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

if (!IS_LAMBDA) mkdirpSync(logDir);

log4js.addLayout('json', function(config) {
  return function(logEvent) { 
    return JSON.stringify(logEvent) + config.separator; 
  }
});

const log4jsConfig = {
  appenders: IS_LAMBDA ? {
    stdout: { type: 'stdout', layout: { type: 'json', separator: ',' } }
  } : {
    file: { 
      type: 'file',
      filename: logsFilePath,
      layout: { type: 'json', separator: ',' }
    },
    errorFile: {
      type: 'file',
      filename: errorLogsFilePath,
      layout: { type: 'json', separator: ',' }
    }
  },
  categories: IS_LAMBDA ? {
    default: { 
      appenders: ['stdout'], 
      level: 'info' 
    },
    error: {
      appenders: ['stdout'],
      level: 'error'
    }
  } : {
    default: { 
      appenders: ['file'], 
      level: 'info' 
    },
    error: {
      appenders: ['errorFile'],
      level: 'error'
    }
  }
};
log4js.configure(log4jsConfig);

const appLogger = log4js.getLogger('default');

function log(command, event, body) {
  appLogger.info({
    command,
    event,
    body
  });
}

function logErr(command, event, body, error) {
  const logError = error ? (error.stack || error.toString()) : null;
  const errorLogger = log4js.getLogger('error');

  errorLogger.error({
    command,
    event,
    body,
    error: logError
  });
}

function createAdhocLogFile(description, code, result, error = null) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFileName = path.join(logDir, `adhoc-${timestamp}${error ? '-error' : ''}.log`);
  
  const delimiter = '\n\n---\n\n';

  let prettyResult;
  try {
    const parsedResult = JSON.parse(result);
    prettyResult = JSON.stringify(parsedResult, null, 2);
  } catch (e) {
    prettyResult = result;
  }

  const logContent = [
    `Description: \n\n ${description}`,
    delimiter,
    `Code: \n\n ${code}`,
    delimiter,
    `Result: \n\n ${prettyResult}`,
    error ? `${delimiter}Error: ${error.stack}` : ''
  ].join('');

  fs.writeFileSync(logFileName, logContent);
}

module.exports = {
  log,
  logErr,
  createAdhocLogFile
};