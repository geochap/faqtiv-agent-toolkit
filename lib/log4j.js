import log4js from 'log4js';
import * as config from '../config.js';

const logsFilePath = `${config.project.logsDir}/app.log`;
const errorLogsFilePath = `${config.project.logsDir}/err.log`;

log4js.addLayout('json', function(config) {
  return function(logEvent) { 
    return JSON.stringify(logEvent) + config.separator; 
  }
});

const log4jsConfig = {
    appenders: {
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
    categories: {
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

export const appLogger = log4js.getLogger('default');

export const log = (command, event, body) => {
  appLogger.info({
    command,
    event,
    body
  });
}

export const logErr = (command, event, body, error) => {
  const logError = error ? (error.stack || error.toString()) : null;
  const errorLogger = log4js.getLogger('error');

  errorLogger.error({
    command,
    event,
    body,
    error: logError
  });
}