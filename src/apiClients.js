/**
 * API Clients for WordPress and other services
 */

const axios = require("axios");
const config = require("./config");

// Create WordPress API client with authentication
const wpApi = axios.create({
  baseURL: config.wordpress.apiEndpointUrl, // Use the correct endpoint URL that includes wp-json
  headers: {
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(
      `${config.wordpress.username}:${config.wordpress.password}`
    ).toString("base64")}`,
  },
  timeout: 30000,
  httpsAgent: new (require("https").Agent)({
    rejectUnauthorized: false,
  }),
});

// Create a public WordPress API client (for reading operations only)
const wpPublicApi = axios.create({
  baseURL: config.wordpress.apiEndpointUrl, // Use the correct endpoint URL that includes wp-json
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
  httpsAgent: new (require("https").Agent)({
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
    } else if (error.request) {
      console.error("API Request Error (No response):", error.message);
    } else {
      console.error("API Error:", error.message);
    }
    return Promise.reject(error);
  }
);

module.exports = {
  wpApi,
  wpPublicApi,
};
