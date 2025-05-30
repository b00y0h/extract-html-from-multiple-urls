/**
 * Utility to find WordPress pages by their full URLs or site paths
 */

const axios = require("axios");
const https = require("https");
const config = require("../config");
const { logMessage } = require("./logs");

// Helper function to create an axios instance with proper auth and configuration
function createWpAxios(requiresAuth = true) {
  const instance = axios.create({
    baseURL: config.wordpress.apiEndpointUrl,
    headers: {
      "User-Agent": config.wordpress.userAgent,
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

/**
 * Find a page by its full URL or site path
 * This searches across all pages to find one with a matching link path
 *
 * @param {string} path - The path to search for (e.g., "about" or "/about")
 * @returns {Promise<{id: number, title: string}|null>} Page ID and title or null if not found
 */
async function findPageByLink(path) {
  try {
    // Normalize the path by removing leading/trailing slashes
    const normalizedPath = path.replace(/^\/+|\/+$/g, "");
    logMessage(
      `Searching for page with normalized path: "${normalizedPath}"`,
      config.paths.createMenuLogFile
    );

    // Get all pages (paginated to handle large sites)
    let allPages = [];
    let currentPage = 1;
    const perPage = 100; // Maximum allowed by WordPress

    let hasMorePages = true;
    while (hasMorePages) {
      try {
        const response = await wpPublicApi.get("/wp/v2/pages", {
          params: {
            per_page: perPage,
            page: currentPage,
          },
        });

        const pageResults = response.data;

        if (pageResults && pageResults.length > 0) {
          allPages = allPages.concat(pageResults);
          currentPage++;
        } else {
          hasMorePages = false;
        }

        // Check for total pages from headers
        const totalPages = parseInt(response.headers["x-wp-totalpages"], 10);
        if (!isNaN(totalPages) && currentPage > totalPages) {
          hasMorePages = false;
        }
      } catch (err) {
        logMessage(
          `Error retrieving page ${currentPage}: ${err.message}`,
          config.paths.createMenuLogFile
        );
        hasMorePages = false;
      }
    }

    logMessage(
      `Retrieved ${allPages.length} pages to search for path "${normalizedPath}"`,
      config.paths.createMenuLogFile
    );

    // Now search through all pages to find a matching link path
    for (const page of allPages) {
      try {
        // Clean the page link to get just the path
        const pageUrl = new URL(page.link);
        const pagePath = pageUrl.pathname.replace(/^\/+|\/+$/g, "");

        // Try direct match
        if (pagePath === normalizedPath) {
          logMessage(
            `Found exact path match: "${pagePath}" for page ID ${page.id}, title "${page.title.rendered}"`,
            config.paths.createMenuLogFile
          );
          return {
            id: page.id,
            title: page.title.rendered,
          };
        }

        // Try exact match at the end of the path
        if (pagePath.endsWith(`/${normalizedPath}`)) {
          logMessage(
            `Found path match at the end: "${pagePath}" contains "${normalizedPath}" for page ID ${page.id}, title "${page.title.rendered}"`,
            config.paths.createMenuLogFile
          );
          return {
            id: page.id,
            title: page.title.rendered,
          };
        }
      } catch (urlError) {
        // Skip pages with invalid URLs
        continue;
      }
    }

    logMessage(
      `No page found with path "${normalizedPath}" in their URLs`,
      config.paths.createMenuLogFile
    );
    return null;
  } catch (error) {
    logMessage(
      `Error in findPageByLink: ${error.message}`,
      config.paths.createMenuLogFile
    );
    return null;
  }
}

module.exports = {
  findPageByLink,
};
