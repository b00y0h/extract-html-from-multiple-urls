/**
 * Test the Axios API implementation for WordPress
 */
require("dotenv").config();
const axios = require("axios");
const https = require("https");
const config = require("./src/config");

// Helper function to create an axios instance with proper auth and configuration
function createWpAxios(requiresAuth = true) {
  const instance = axios.create({
    baseURL: config.wordpress.apiEndpointUrl,
    headers: {
      "User-Agent": config.wordpress.userAgent || "WordPress API Client",
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    httpsAgent: new https.Agent({
      rejectUnauthorized: false,
    }),
    timeout: 10000,
  });

  // Add authentication if required
  if (requiresAuth && config.wordpress.username && config.wordpress.password) {
    const base64Credentials = Buffer.from(
      `${config.wordpress.username}:${config.wordpress.password}`
    ).toString("base64");

    instance.defaults.headers.common[
      "Authorization"
    ] = `Basic ${base64Credentials}`;
  }

  return instance;
}

// Create axios instances for authenticated and public requests
const wpAuthApi = createWpAxios(true);
const wpPublicApi = createWpAxios(false);

async function testAxiosImplementation() {
  console.log("\n=== TESTING AXIOS IMPLEMENTATION ===");
  console.log(`API Endpoint: ${config.wordpress.apiEndpointUrl}`);

  try {
    // Test public API access - get a list of pages
    console.log("\n[Testing public API access]");
    const pagesResponse = await wpPublicApi.get("/wp/v2/pages", {
      params: { per_page: 5 },
    });

    console.log(`✅ Successfully retrieved ${pagesResponse.data.length} pages`);
    console.log(
      `Total pages available: ${
        pagesResponse.headers["x-wp-total"] || "unknown"
      }`
    );

    // Test authenticated API access - get current user info
    console.log("\n[Testing authenticated API access]");
    const userResponse = await wpAuthApi.get("/wp/v2/users/me");

    console.log(
      `✅ Successfully authenticated as: ${userResponse.data.name} (${userResponse.data.id})`
    );

    console.log(
      "\nAll tests passed! Axios implementation is working correctly."
    );
  } catch (error) {
    console.error("❌ Error during testing:", error.message);
    if (error.response) {
      console.error(`Status code: ${error.response.status}`);
      console.error(`Response data:`, error.response.data);
    }
  }
}

// Run the test
testAxiosImplementation().catch(console.error);
