const fs = require('fs');
const path = require('path');
const { mkdirpSync } = require('mkdirp');
const log4js = require('log4js');
const { AsyncLocalStorage } = require('async_hooks');
const logDir = path.join(process.cwd(), 'logs');
const logsFilePath = `${logDir}/app.log`;
const errorLogsFilePath = `${logDir}/err.log`;
const { LOG_LEVEL } = require('../constants');
const IS_LAMBDA = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

if (!IS_LAMBDA) mkdirpSync(logDir);

// Create AsyncLocalStorage for request context
const asyncLocalStorage = new AsyncLocalStorage();

function setRequestContext(context) {
  asyncLocalStorage.enterWith(context);
}

// Custom JSON layout for structured logs
log4js.addLayout('structuredJson', function (config) {
  return function (logEvent) {
    const context = asyncLocalStorage.getStore() || {};
    const [first, ...rest] = logEvent.data || [];
    let message = '';
    let data = undefined;
    if (typeof first === 'string') {
      message = first;
      if (rest.length) {
        data = rest.length === 1 ? rest[0] : rest;
      }
    } else if (first !== undefined) {
      message = 'No message provided';
      data = [first, ...rest].length === 1 ? first : [first, ...rest];
    }
    // Remove requestId from data if present
    if (data && typeof data === 'object' && data.requestId) {
      data = { ...data };
      delete data.requestId;
    }
    const logObject = {
      timestamp: new Date(logEvent.startTime).toISOString(),
      level: logEvent.level.levelStr.toUpperCase(),
      category: logEvent.categoryName,
      message,
      requestId: context.requestId,
      data,
    };
    // Remove undefined fields
    Object.keys(logObject).forEach((key) => {
      if (logObject[key] === undefined) {
        delete logObject[key];
      }
    });
    return JSON.stringify(logObject) + (config.separator || '\n');
  };
});

const appenders = IS_LAMBDA
  ? {
      out: { type: 'stdout', layout: { type: 'structuredJson', separator: '\n' } },
      err: { type: 'stderr', layout: { type: 'structuredJson', separator: '\n' } },
    }
  : {
      out: { type: 'stdout', layout: { type: 'structuredJson', separator: '\n' } },
      err: { type: 'stderr', layout: { type: 'structuredJson', separator: '\n' } },
      file: {
        type: 'file',
        filename: logsFilePath,
        layout: { type: 'structuredJson', separator: ',' },
      },
      errorFile: {
        type: 'file',
        filename: errorLogsFilePath,
        layout: { type: 'structuredJson', separator: ',' },
      },
    };

const categories = IS_LAMBDA
  ? {
      default: { appenders: ['out', 'err'], level: 'info' },
      error: { appenders: ['err'], level: 'error' },
    }
  : {
      default: { appenders: ['out', 'err', 'file'], level: 'info' },
      error: { appenders: ['err', 'errorFile'], level: 'error' },
    };

log4js.configure({ appenders, categories });

const appLogger = log4js.getLogger();
const errorLogger = log4js.getLogger('error');

function log(message, ...args) {
  appLogger.info(message, ...args);
}

function logWarning(message, ...args) {
  appLogger.warn(message, ...args);
}

function logErr(message, ...args) {
  errorLogger.error(message, ...args);
}

function logDebug(message, ...args) {
  if (config.logging.LOG_LEVEL === 'debug') {
    appLogger.debug(message, ...args);
  }
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
    error ? `${delimiter}Error: ${error.stack}` : '',
  ].join('');
  fs.writeFileSync(logFileName, logContent);
}

module.exports = {
  log,
  logWarning,
  logErr,
  logDebug,
  createAdhocLogFile,
  setRequestContext,
};