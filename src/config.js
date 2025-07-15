require("dotenv").config();
const path = require("path");

module.exports = {
  // WordPress API settings
  wordpress: {
    baseUrl: process.env.WP_BASE_URL,
    apiBaseUrl: process.env.WP_API_BASE_URL
      ? process.env.WP_API_BASE_URL.replace(/\/+$/, "")
      : "",
    get apiEndpointUrl() {
      // Ensure the URL contains the wp-json path segment
      const baseUrl = this.apiBaseUrl;
      if (!baseUrl) return "";

      if (baseUrl.includes("/wp-json")) {
        return baseUrl;
      } else {
        return `${baseUrl}/wp-json`;
      }
    },
    userAgent:
      process.env.WP_USER_AGENT ||
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36",
    username: process.env.WP_API_USERNAME,
    password: process.env.WP_API_PASSWORD,
    rateLimitMs: 2000, // 1 seconds between WordPress API requests
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
    urlProcessLimit: 10,
  },

  // File paths
  paths: {
    errorUrlFile: path.join(process.cwd(), "logs", "error_url.txt"),
    apiLogFile: path.join(process.cwd(), "logs", "API_log.txt"),
    crawlingLogFile: path.join(process.cwd(), "logs", "crawling_log.txt"),
    formLogFile: path.join(process.cwd(), "logs", "form_log.txt"),
    createMenuLogFile: path.join(process.cwd(), "logs", "create_menu_log.txt"),
    imagesDir: path.join(process.cwd(), "images"), // Directory to store downloaded images
  },
};
