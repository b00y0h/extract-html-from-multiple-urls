#!/usr/bin/env node

/**
 * WordPress API Request Debugger
 *
 * This script logs the exact details of authentication headers being sent
 * to help debug WordPress REST API authentication issues.
 */

require("dotenv").config();
const config = require("./src/config");

// Get authorization information
const username = config.wordpress.username;
const password = config.wordpress.password;

// Create Base64 encoded credentials
const base64Credentials = Buffer.from(`${username}:${password}`).toString(
  "base64"
);

// Format exactly as seen in a network request
console.log("========================================");
console.log("    WORDPRESS API REQUEST DETAILS       ");
console.log("========================================");
console.log(`API Base URL: ${config.wordpress.apiBaseUrl}`);
console.log(`Endpoint: /wp-json/wp/v2/settings`);
console.log(`Username: ${username}`);
console.log(`Password: ${password}`);
console.log("\nHTTP Request Headers:");
console.log("--------------------");
console.log(`Authorization: Basic ${base64Credentials}`);
console.log(`User-Agent: ${config.wordpress.userAgent}`);
console.log("Accept: application/json");

// Show curl command for testing
console.log("\nCURL command to test:");
console.log("--------------------");
console.log(`curl -v -X GET "${config.wordpress.apiBaseUrl}/wp-json/wp/v2/settings" \\
  -H "Authorization: Basic ${base64Credentials}" \\
  -H "User-Agent: ${config.wordpress.userAgent}" \\
  -H "Accept: application/json" \\
  --insecure`);

console.log("\n========================================");

// Check for password issues
if (password.includes(" ")) {
  console.log("\n⚠️ NOTE: Your password contains spaces");
  console.log(
    "Make sure spaces are preserved exactly as provided by WordPress"
  );
  console.log(
    "Application passwords should look like: xxxx xxxx xxxx xxxx xxxx xxxx"
  );
}

console.log(
  "\nYou can use this curl command in your terminal to test the API directly."
);
console.log(
  "If it works in curl but not in your application, the issue is in how"
);
console.log("your application is sending the authentication headers.");
