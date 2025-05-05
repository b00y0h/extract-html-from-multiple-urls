const fs = require("fs");

const LOG_FILE = "crawling_log.txt";

// Function to log messages to a file
function logMessage(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
}

module.exports = { logMessage };
