import os
import json
import logging
from datetime import datetime
from logging.handlers import RotatingFileHandler
from constants import IS_LAMBDA

log_dir = os.path.join(os.getcwd(), 'logs')
logs_file_path = os.path.join(log_dir, 'app.log')
error_logs_file_path = os.path.join(log_dir, 'err.log')

if not IS_LAMBDA:
    os.makedirs(log_dir, exist_ok=True)

class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            'timestamp': self.formatTime(record, self.datefmt),
            'level': record.levelname,
            'message': record.getMessage(),
        }
        if record.exc_info:
            log_record['exception'] = self.formatException(record.exc_info)
        return json.dumps(log_record)

app_logger = logging.getLogger('app')
app_logger.setLevel(logging.INFO)
app_logger.propagate = False

error_logger = logging.getLogger('error')
error_logger.setLevel(logging.ERROR)
error_logger.propagate = False

if IS_LAMBDA:
    # Use stdout for Lambda logging
    stdout_handler = logging.StreamHandler()
    stdout_handler.setFormatter(JsonFormatter())
    app_logger.addHandler(stdout_handler)
    error_logger.addHandler(stdout_handler)
else:
    # Use file handlers for local environment
    app_file_handler = RotatingFileHandler(logs_file_path, maxBytes=10*1024*1024, backupCount=5)
    app_file_handler.setFormatter(JsonFormatter())
    app_logger.addHandler(app_file_handler)

    error_file_handler = RotatingFileHandler(error_logs_file_path, maxBytes=10*1024*1024, backupCount=5)
    error_file_handler.setFormatter(JsonFormatter())
    error_logger.addHandler(error_file_handler)

def log(command, event, body):
    app_logger.info(json.dumps({
        'command': command,
        'event': event,
        'body': body
    }))

def log_err(command, event, body, error):
    log_error = str(error) if error else None
    error_logger.error(json.dumps({
        'command': command,
        'event': event,
        'body': body,
        'error': log_error
    }))

def create_adhoc_log_file(description, code, result, error=None):
    timestamp = datetime.now().isoformat().replace(':', '-').replace('.', '-')
    log_file_name = os.path.join(log_dir, f"adhoc-{timestamp}{'-error' if error else ''}.log")
    
    delimiter = '\n\n---\n\n'

    if isinstance(result, dict):
        pretty_result = json.dumps(result, indent=2)
    else:
        try:
            # Try to parse result as JSON if it's a string
            pretty_result = json.dumps(json.loads(result), indent=2)
        except (json.JSONDecodeError, TypeError):
            # If parsing fails or result is not a string, use it as is
            pretty_result = str(result)

    log_content = delimiter.join([
        f"Description: \n\n {description}",
        f"Code: \n\n {code}",
        f"Result: \n\n {pretty_result}",
        f"Error: {error}" if error else ''
    ])

    with open(log_file_name, 'w') as f:
        f.write(log_content)