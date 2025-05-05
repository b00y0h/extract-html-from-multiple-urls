require("dotenv").config();

module.exports = {
  // WordPress API settings
  wordpress: {
    apiBaseUrl:
      process.env.WP_API_BASE_URL || "https://wsuwp.vancouver.wsu.edu/eab/",
    userAgent:
      process.env.WP_USER_AGENT ||
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36",
    username: process.env.WP_API_USERNAME,
    password: process.env.WP_API_PASSWORD,
    rateLimitMs: 2000, // 2 seconds between WordPress API requests
  },

  // URL configuration
  urls: {
    production: "vancouver.wsu.edu",
    staging: process.env.STAGING_URL || "wsuwp.vancouver.wsu.edu/eab",
  },

  // Content fetching settings
  crawler: {
    concurrencyLimit: 5,
    crawlDelayMs: 2000, // 2 seconds between content fetches
    userAgent: "EAB Crawler/1.0 (https://agency.eab.com/; bobsmith@eab.com)",
    urlProcessLimit: 300,
  },

  // File paths
  paths: {
    errorUrlFile: "error_url.txt",
    apiLogFile: "API_log.txt",
    crawlingLogFile: "crawling_log.txt",
    imagesDir: "images", // Directory to store downloaded images
  },
};
