/**
 * API Clients for WordPress and other services
 */

const axios = require("axios");
const https = require("https");
const config = require("./config");

console.log(
  `Initializing WordPress API clients with endpoint: ${config.wordpress.apiEndpointUrl}`
);

// Create WordPress API client with authentication
const wpApi = axios.create({
  baseURL: config.wordpress.apiEndpointUrl, // Use the correct endpoint URL that includes wp-json
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36",
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(
      `${config.wordpress.username}:${config.wordpress.password}`
    ).toString("base64")}`,
  },
  timeout: 30000,
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
  }),
});

// Create a public WordPress API client (for reading operations only)
const wpPublicApi = axios.create({
  baseURL: config.wordpress.apiEndpointUrl, // Use the correct endpoint URL that includes wp-json
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36",
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  timeout: 30000,
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
  }),
});

// Add response interceptor for debugging
wpApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      console.error(
        `API Error [${error.response.status}]:`,
        error.response.data
      );

      // Special handling for 403 errors
      if (error.response.status === 403) {
        console.error(
          "\n⛔ 403 FORBIDDEN: This usually indicates an authentication issue."
        );
        console.error("Check your WordPress credentials and permissions.");
        console.error(
          "Run node checkWordPressApiAuth.js for a detailed diagnosis.\n"
        );
      }
    } else if (error.request) {
      console.error("API Request Error (No response):", error.message);
    } else {
      console.error("API Error:", error.message);
    }
    return Promise.reject(error);
  }
);

module.exports = { wpApi, wpPublicApi };

module.exports = {
  wpApi,
  wpPublicApi,
};
