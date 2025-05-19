const fs = require("fs");

const LOG_FILE = "crawling_log.txt";

// Function to log messages to a file
function logMessage(message, logFile = LOG_FILE) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
}

module.exports = { logMessage };
