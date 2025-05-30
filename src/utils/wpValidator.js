const axios = require("axios");
const https = require("https");
const config = require("../config");

/**
 * Tests if a URL is reachable
 * @param {string} url - The URL to test
 * @returns {Promise<{success: boolean, message: string, status?: number}>}
 */
async function testUrlReachable(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": config.wordpress.userAgent,
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      timeout: 10000,
      validateStatus: () => true, // Accept any status code
    });

    return {
      success: response.status >= 200 && response.status < 400,
      message: `URL returned status ${response.status} ${response.statusText}`,
      status: response.status,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to reach URL: ${error.message}`,
    };
  }
}

/**
 * Tests WordPress API authentication
 * @returns {Promise<{success: boolean, message: string, status?: number, user?: object}>}
 */
async function testAuthentication() {
  try {
    // Create Base64 encoded credentials for direct header authentication
    const base64Credentials = Buffer.from(
      `${config.wordpress.username}:${config.wordpress.password}`
    ).toString("base64");

    const response = await axios.get(
      `${config.wordpress.apiBaseUrl}/wp-json/wp/v2/users/me`,
      {
        headers: {
          "User-Agent": config.wordpress.userAgent,
          Authorization: `Basic ${base64Credentials}`,
        },
        // Keep auth property as fallback
        auth: {
          username: config.wordpress.username,
          password: config.wordpress.password,
        },
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
        timeout: 10000,
        validateStatus: () => true, // Accept any status code
      }
    );

    if (response.status === 200) {
      return {
        success: true,
        message: `Successfully authenticated as ${response.data.name}`,
        status: response.status,
        user: response.data,
      };
    } else {
      return {
        success: false,
        message: `Authentication failed with status ${response.status}`,
        status: response.status,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Authentication error: ${error.message}`,
    };
  }
}

/**
 * Tests if WordPress REST API is available
 * @returns {Promise<{success: boolean, message: string, status?: number}>}
 */
async function testRestApiAvailable() {
  try {
    const response = await axios.get(`${config.wordpress.apiBaseUrl}/wp-json`, {
      headers: {
        "User-Agent": config.wordpress.userAgent,
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      timeout: 10000,
      validateStatus: () => true, // Accept any status code
    });

    return {
      success: response.status === 200,
      message:
        response.status === 200
          ? "WordPress REST API is available"
          : `REST API check failed with status ${response.status}`,
      status: response.status,
    };
  } catch (error) {
    return {
      success: false,
      message: `REST API check error: ${error.message}`,
    };
  }
}

/**
 * Tests if WordPress has the necessary permissions
 * @returns {Promise<{success: boolean, message: string, status?: number}>}
 */
async function testCreatePermissions() {
  try {
    // Create Base64 encoded credentials for direct header authentication
    const base64Credentials = Buffer.from(
      `${config.wordpress.username}:${config.wordpress.password}`
    ).toString("base64");

    // Try to get the list of pages to test read permissions
    const response = await axios.get(
      `${config.wordpress.apiBaseUrl}/wp-json/wp/v2/pages?per_page=1`,
      {
        headers: {
          "User-Agent": config.wordpress.userAgent,
          Authorization: `Basic ${base64Credentials}`,
        },
        // Keep auth property as fallback
        auth: {
          username: config.wordpress.username,
          password: config.wordpress.password,
        },
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
        timeout: 10000,
        validateStatus: () => true, // Accept any status code
      }
    );

    return {
      success: response.status === 200,
      message:
        response.status === 200
          ? "User has read permissions for pages"
          : `Page permission check failed with status ${response.status}`,
      status: response.status,
    };
  } catch (error) {
    return {
      success: false,
      message: `Permission check error: ${error.message}`,
    };
  }
}

/**
 * Runs a comprehensive validation of the WordPress connection
 * @returns {Promise<{success: boolean, details: object}>}
 */
async function validateWordPressComprehensive() {
  const results = {
    configCheck: {
      success: true,
      messages: [],
    },
    urlCheck: null,
    restApiCheck: null,
    authCheck: null,
    permissionCheck: null,
  };

  // Check configuration first
  if (!config.wordpress.apiBaseUrl) {
    results.configCheck.success = false;
    results.configCheck.messages.push("WordPress API URL is not configured");
  }

  if (!config.wordpress.username) {
    results.configCheck.success = false;
    results.configCheck.messages.push("WordPress username is not configured");
  }

  if (!config.wordpress.password) {
    results.configCheck.success = false;
    results.configCheck.messages.push("WordPress password is not configured");
  }

  // If config is invalid, don't proceed with connection tests
  if (!results.configCheck.success) {
    return {
      success: false,
      details: results,
    };
  }

  // Check if the base URL is reachable
  results.urlCheck = await testUrlReachable(config.wordpress.apiBaseUrl);

  // Only proceed with other checks if URL is reachable
  if (results.urlCheck.success) {
    // Check if REST API is available
    results.restApiCheck = await testRestApiAvailable();

    // Check authentication
    results.authCheck = await testAuthentication();

    // Check permissions (only if auth is successful)
    if (results.authCheck.success) {
      results.permissionCheck = await testCreatePermissions();
    }
  }

  // Determine overall success
  const overallSuccess =
    results.configCheck.success &&
    results.urlCheck.success &&
    results.restApiCheck.success &&
    results.authCheck.success &&
    (results.permissionCheck?.success || false);

  return {
    success: overallSuccess,
    details: results,
  };
}

module.exports = {
  validateWordPressComprehensive,
  testUrlReachable,
  testAuthentication,
  testRestApiAvailable,
  testCreatePermissions,
};
