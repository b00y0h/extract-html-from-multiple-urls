const fs = require("fs");
const path = require("path");

const LOG_FILE = "crawling_log.txt";

// Function to ensure log directory exists
function ensureLogDirectoryExists(logFile) {
  const logDir = path.dirname(logFile);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

// Function to log messages to a file
function logMessage(message, logFile = LOG_FILE) {
  try {
    ensureLogDirectoryExists(logFile);
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
  } catch (error) {
    console.error(`Error writing to log file: ${error.message}`);
  }
}

module.exports = { logMessage };
