require("dotenv").config();
const path = require("path");

module.exports = {
  // WordPress API settings
  wordpress: {
    baseUrl: process.env.WP_BASE_URL,
    apiBaseUrl: process.env.WP_API_BASE_URL
      ? process.env.WP_API_BASE_URL.replace(/\/+$/, "")
      : "",
    userAgent:
      process.env.WP_USER_AGENT ||
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36",
    username: process.env.WP_API_USERNAME,
    password: process.env.WP_API_PASSWORD,
    rateLimitMs: 200, // 1 seconds between WordPress API requests
  },

  // URL configuration
  urls: {
    production: process.env.PRODUCTION_URL || "",
    staging: process.env.STAGING_URL || "",
  },

  // Content fetching settings
  crawler: {
    concurrencyLimit: 5,
    crawlDelayMs: 1000, // 2 seconds between content fetches
    userAgent: "EAB Crawler/1.0 (https://agency.eab.com/; bobsmith@eab.com)",
    // userAgent:
    //   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36",
    urlProcessLimit: 1000,
  },

  // File paths
  paths: {
    errorUrlFile: "error_url.txt",
    apiLogFile: "API_log.txt",
    crawlingLogFile: "crawling_log.txt",
    formLogFile: "form_log.txt",
    imagesDir: path.join(process.cwd(), "images"), // Directory to store downloaded images
  },
};
