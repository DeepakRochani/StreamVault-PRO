const fs = require('fs');
const path = require('path');

const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const getLogFilePath = () => {
  const date = new Date().toISOString().split('T')[0];
  return path.join(logDir, `yt-dlp-${date}.log`);
};

const formatMessage = (level, message, context = {}) => {
  return JSON.stringify({ level, timestamp: new Date().toISOString(), message, context });
};

const logger = {
  info: (message, context = {}) => {
    const logEntry = formatMessage('INFO', message, context);
    console.log(`[INFO] ${message}`);
    fs.appendFileSync(getLogFilePath(), logEntry + '\n');
  },
  error: (message, context = {}) => {
    const logEntry = formatMessage('ERROR', message, context);
    console.error(`[ERROR] ${message}`);
    fs.appendFileSync(getLogFilePath(), logEntry + '\n');
  },
  warn: (message, context = {}) => {
    const logEntry = formatMessage('WARN', message, context);
    console.warn(`[WARN] ${message}`);
    fs.appendFileSync(getLogFilePath(), logEntry + '\n');
  },
  debug: (message, context = {}) => {
    const logEntry = formatMessage('DEBUG', message, context);
    console.debug(`[DEBUG] ${message}`);
    fs.appendFileSync(getLogFilePath(), logEntry + '\n');
  }
};

module.exports = logger;
