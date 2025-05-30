require("dotenv").config();
const fs = require("fs");
const axios = require("axios");
const https = require("https");
const config = require("./config");
const { batchUploadImagesToWP } = require("./batchUploadImagesToWp");
const path = require("path");
const { logMessage } = require("./utils/logs");

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

// Helper function for rate limiting
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const wpConfig = {
  endpoint: config.wordpress.apiEndpointUrl, // Use the corrected URL with wp-json
  username: config.wordpress.username,
  password: config.wordpress.password,
};
console.log(
  "✅✅✅✅✅✅ ~ wpConfig:",
  wpConfig.endpoint,
  wpConfig.username,
  wpConfig.password
);

/**
 * Validates WordPress connection before running any migration
 * @returns {Promise<boolean>} True if connection is valid, throws error otherwise
 */
async function validateWordPressConnection() {
  console.log("\n[VALIDATING WORDPRESS CONNECTION] ---------------------");
  console.log(`Checking connection to: ${config.wordpress.apiBaseUrl}`);
  console.log(`Username: ${config.wordpress.username}`);
  console.log(
    `Password: ${config.wordpress.password ? "********" : "[NOT SET]"}`
  );

  if (!config.wordpress.apiBaseUrl) {
    throw new Error(
      "WordPress API URL is not configured. Please check your environment variables."
    );
  }

  if (!config.wordpress.username || !config.wordpress.password) {
    throw new Error(
      "WordPress credentials are not configured. Please check your environment variables."
    );
  }

  // First check if the WordPress site is reachable at all (without auth)
  try {
    console.log(
      `Testing if site is reachable at: ${config.wordpress.apiBaseUrl}`
    );
    const basicResponse = await axios.get(config.wordpress.apiBaseUrl, {
      headers: {
        "User-Agent": config.wordpress.userAgent,
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      timeout: 10000,
      validateStatus: () => true, // Don't throw on any status code
    });

    if (basicResponse.status >= 200 && basicResponse.status < 400) {
      console.log(
        `✅ WordPress site is reachable (Status: ${basicResponse.status})`
      );
    } else {
      console.error(
        `❌ WordPress site returned error status: ${basicResponse.status}`
      );
      throw new Error(
        `WordPress site returned error status: ${basicResponse.status}`
      );
    }

    // Check if REST API is available
    console.log(
      `Testing if REST API is available at: ${config.wordpress.apiBaseUrl}/wp-json/`
    );
    const restApiResponse = await axios.get(
      `${config.wordpress.apiBaseUrl}/wp-json/`,
      {
        headers: {
          "User-Agent": config.wordpress.userAgent,
        },
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
        timeout: 10000,
        validateStatus: () => true, // Don't throw on any status code
      }
    );

    if (restApiResponse.status === 200) {
      console.log(`✅ WordPress REST API is available`);
    } else {
      console.error(
        `❌ WordPress REST API is not available (Status: ${restApiResponse.status})`
      );
      throw new Error(
        `WordPress REST API is not available: ${restApiResponse.status} ${restApiResponse.statusText}`
      );
    }

    // Try to authenticate with the WordPress API
    console.log(
      `Testing authentication with username: ${config.wordpress.username}`
    );
    // Create Base64 encoded credentials (mimicking how browsers and Postman send credentials)
    const base64Credentials = Buffer.from(
      `${config.wordpress.username}:${config.wordpress.password}`
    ).toString("base64");

    // Define a list of user agents to try if the default fails
    const userAgents = [
      config.wordpress.userAgent,
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15", // Modern Safari
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", // Modern Chrome
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/119.0", // Modern Firefox
      "PostmanRuntime/7.32.3", // Postman
    ];

    let response;
    let successfulUserAgent;
    let lastError;

    // Try each user agent until one works
    for (const userAgent of userAgents) {
      try {
        console.log(`Trying with User Agent: "${userAgent}"`);
        response = await axios.get(
          `${config.wordpress.apiBaseUrl}/wp-json/wp/v2/users/me`,
          {
            headers: {
              "User-Agent": userAgent,
              Authorization: `Basic ${base64Credentials}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            httpsAgent: new https.Agent({
              rejectUnauthorized: false,
            }),
            timeout: 10000,
          }
        );

        successfulUserAgent = userAgent;
        console.log(`✅ User agent "${userAgent}" worked successfully!`);
        break; // Exit the loop if successful
      } catch (err) {
        console.log(`❌ User agent "${userAgent}" failed: ${err.message}`);
        if (err.response) {
          console.log(`  Status: ${err.response.status}`);
        }
        lastError = err;
      }
    }

    if (!response) {
      throw (
        lastError ||
        new Error("All user agents failed to authenticate with WordPress API")
      );
    }

    // If we found a successful user agent that's different from the configured one, suggest updating it
    if (
      successfulUserAgent &&
      successfulUserAgent !== config.wordpress.userAgent
    ) {
      console.log(
        `\n⚠️ RECOMMENDATION: Update your WP_USER_AGENT in .env to: "${successfulUserAgent}"`
      );
    }

    console.log(
      `✅ WordPress connection successful! Connected as: ${response.data.name}`
    );

    // Check if roles property exists and is an array before calling join
    if (response.data.roles && Array.isArray(response.data.roles)) {
      console.log(`✅ User roles: ${response.data.roles.join(", ")}`);

      // Additional check to verify user has necessary permissions
      if (
        !response.data.roles.some((role) =>
          ["administrator", "editor", "author"].includes(role)
        )
      ) {
        console.warn(
          `⚠️ Warning: User may not have sufficient permissions for content creation. Current roles: ${response.data.roles.join(
            ", "
          )}`
        );
      }
    } else {
      console.log(`✅ User roles: Unknown or not provided`);
      console.warn(
        `⚠️ Warning: Could not determine user roles. This might affect content creation permissions.`
      );
    }

    return true;
  } catch (error) {
    console.error("❌ WordPress connection failed:");

    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error(`Status: ${error.response.status}`);
      console.error(`Status Text: ${error.response.statusText}`);

      if (error.response.status === 403) {
        console.error(
          "This appears to be a permissions issue. Possible causes:"
        );
        console.error(
          "1. The credentials are correct but the user lacks sufficient permissions"
        );
        console.error(
          "2. The WordPress site has a security plugin blocking API access"
        );
        console.error(
          "3. Basic authentication is disabled on the WordPress instance"
        );
        console.error(
          "4. The WordPress site may require application passwords instead of regular passwords"
        );
        console.error(
          "5. The API endpoint URL may be incorrect or doesn't have the /wp-json prefix"
        );

        // Check if the URL structure is correct
        if (!config.wordpress.apiBaseUrl.endsWith("/wp-json")) {
          console.error(
            "\n⚠️ Warning: Your API URL doesn't end with '/wp-json'"
          );
          console.error(`Current URL: ${config.wordpress.apiBaseUrl}`);
          console.error(
            "Suggestion: Make sure your API URL looks like: https://your-wordpress-site.com/wp-json"
          );
        }

        // Try to check if the REST API is configured properly
        try {
          const namespaceResponse = await axios.get(
            `${config.wordpress.apiBaseUrl.replace(
              /\/wp-json\/?$/,
              ""
            )}/wp-json`,
            {
              headers: {
                "User-Agent": config.wordpress.userAgent,
              },
              httpsAgent: new https.Agent({
                rejectUnauthorized: false,
              }),
              timeout: 10000,
              validateStatus: () => true,
            }
          );

          if (namespaceResponse.status === 200) {
            console.log(
              "REST API is available, but authentication is failing. This suggests:"
            );
            console.log("- Basic authentication might be disabled");
            console.log("- You might need to use application passwords");
            console.log(
              "- A security plugin might be blocking authenticated requests"
            );
          }
        } catch (innerError) {
          console.error(
            "Could not check REST API availability:",
            innerError.message
          );
        }
      } else if (error.response.status === 401) {
        console.error(
          "This appears to be an authentication issue. Please check your username and password."
        );
        console.error(
          "If your credentials are correct, try using application passwords instead: https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/"
        );
      } else if (error.response.status === 404) {
        console.error("The API endpoint was not found. This suggests:");
        console.error("1. The WordPress REST API is not enabled");
        console.error("2. The API URL is incorrect");

        if (!config.wordpress.apiBaseUrl.endsWith("/wp-json")) {
          console.error(
            "\n⚠️ Warning: Your API URL doesn't end with '/wp-json'"
          );
          console.error(`Current URL: ${config.wordpress.apiBaseUrl}`);
          console.error(
            "Suggestion: Make sure your API URL looks like: https://your-wordpress-site.com/wp-json"
          );
        }
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error(
        "No response received from the server. The server may be down or unreachable."
      );
      console.error(
        "Please check that the WordPress URL is correct and the server is running."
      );
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error(`Error message: ${error.message}`);
    }

    // Suggestion for resolving common issues
    console.log("\n🔍 TROUBLESHOOTING SUGGESTIONS:");
    console.log("1. Check your .env file for correct credentials and URLs");
    console.log(
      "2. Verify that the WordPress REST API is enabled on your site"
    );
    console.log("3. Check if any security plugins are blocking API access");
    console.log(
      "4. Make sure your WordPress version supports the REST API (4.7+)"
    );
    console.log(
      "5. Try accessing the API endpoint in a browser: [WP_API_BASE_URL]/wp-json/"
    );
    console.log(
      "6. Try using application passwords instead of your regular password"
    );
    console.log("7. Verify your API user has sufficient permissions");
    console.log(
      "8. Check if there are any rate limits or IP restrictions in place"
    );

    throw new Error(`WordPress connection failed: ${error.message}`);
  }
}

// Process an individual image
async function processImage(image) {
  if (!image?.url) {
    throw new Error("Image URL is undefined or null");
  }

  console.log(`📸 Processing image: ${image.url}`);

  try {
    // Save the original URL and ensure it's properly encoded for axios
    const originalUrl = image.url;
    const encodedUrl = encodeURI(decodeURIComponent(originalUrl));
    // console.log(`🔄 Encoded URL: ${encodedUrl}`);

    // Generate filename from original URL to preserve the original name
    const fileName = decodeURIComponent(originalUrl).split("/").pop();
    const localPath = path.join(config.paths.imagesDir, fileName);
    // console.log(`DEBUG: Local path for image: ${localPath}`);

    // Ensure the images directory exists - IMPORTANT FIX
    if (!fs.existsSync(config.paths.imagesDir)) {
      try {
        fs.mkdirSync(config.paths.imagesDir, { recursive: true, mode: 0o755 });
        console.log(`DEBUG: Successfully created images directory`);
      } catch (dirError) {
        console.error(`DEBUG: Error creating directory: ${dirError.message}`);
        throw dirError;
      }
    }

    // If image doesn't exist locally, download it
    if (!fs.existsSync(localPath)) {
      console.log(`📥 Downloading image from ${encodedUrl}`);
      // console.log(`DEBUG: Attempting to download image from: ${encodedUrl}`);
      // console.log(`DEBUG: Saving to local path: ${localPath}`);

      try {
        const response = await axios.get(encodedUrl, {
          responseType: "arraybuffer",
          headers: {
            "User-Agent": config.wordpress.userAgent,
          },
          httpsAgent: new https.Agent({
            rejectUnauthorized: false,
            keepAlive: true,
          }),
          maxRedirects: 5,
          timeout: 30000, // Increased timeout for larger images
        });

        console.log(
          `DEBUG: Image download successful, content length: ${response.data.length}`
        );

        // Save the image locally
        fs.writeFileSync(localPath, Buffer.from(response.data));
        console.log(`✅ Saved image to ${localPath}`);
      } catch (downloadError) {
        console.error(`DEBUG: Download error: ${downloadError.message}`);
        if (downloadError.response) {
          console.error(
            `DEBUG: Response status: ${downloadError.response.status}`
          );
        }
        throw downloadError;
      }
    } else {
      console.log(`DEBUG: Image already exists locally at ${localPath}`);
    }

    // Now use the local file for WordPress upload
    image.url = `file://${localPath}`;
    console.log(`DEBUG: Updated image URL to ${image.url}`);

    const results = await batchUploadImagesToWP([image], wpConfig);

    if (results && results.length > 0) {
      return {
        originalUrl: originalUrl,
        wordpressUrl: results[0].wordpressUrl,
        id: results[0].id,
        alt: image.alt || "",
      };
    }
  } catch (error) {
    console.error(`Error downloading/processing image: ${error.message}`);
    // Log the stack trace for better debugging
    console.error(`Stack trace: ${error.stack}`);
    throw error;
  }
  return null;
}

// Process the content of a URL and save it to a file
async function postToWordPress(url, content, title, action = "Move") {
  console.log("\n[POST TO WORDPRESS] ---------------------");
  console.log(`Processing URL: ${url}`);
  console.log(`Title: ${title}`);
  console.log(`Action: ${action}`);

  try {
    // Validate WordPress connection before proceeding
    try {
      await validateWordPressConnection();
    } catch (validationError) {
      console.error(
        "WordPress connection validation failed. Cannot proceed with posting content."
      );
      console.error(`Validation error: ${validationError.message}`);
      throw new Error(
        `WordPress connection failed: ${validationError.message}`
      );
    }

    // Handle if url is an object with originalUrl property
    const urlStr = typeof url === "object" ? url.originalUrl || url.url : url;
    if (!urlStr || typeof urlStr !== "string") {
      throw new Error(`Invalid URL provided: ${JSON.stringify(url)}`);
    }

    // Get the path segments from the URL
    const pathSegments = urlStr
      .replace(/^(?:https?:\/\/)?(?:www\.)?[^/]+\//, "") // Remove domain part
      .split("/")
      .filter(Boolean);

    console.log(`Path segments:`, pathSegments);

    // Get the slug (last segment)
    const slug =
      pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : "home";
    console.log(`Using slug: ${slug}`);

    // First check if exact page already exists at the correct path
    let parentId = 0; // Start at root level

    // If this isn't a root page, we need to get the parent ID by traversing the path
    if (pathSegments.length > 1) {
      console.log(`Resolving parent hierarchy for: ${urlStr}`);

      // Traverse the path segments except the last one to get the parent ID
      for (let i = 0; i < pathSegments.length - 1; i++) {
        const currentSlug = pathSegments[i];
        console.log(
          `Checking segment ${i + 1}/${pathSegments.length - 1}: ${currentSlug}`
        );

        // Find the page at this level with the correct parent
        const pageId = await findPageBySlug(currentSlug, parentId);

        if (!pageId) {
          // If we're creating pages and a level doesn't exist, create it
          if (action === "Create") {
            console.log(`Creating missing hierarchy level: ${currentSlug}`);
            const placeholderTitle =
              currentSlug.charAt(0).toUpperCase() +
              currentSlug.slice(1).replace(/-/g, " ");

            // Create placeholder page using Axios
            const placeholderData = {
              title: placeholderTitle,
              content: `<!-- wp:paragraph --><p>This is a placeholder page for ${placeholderTitle}.</p><!-- /wp:paragraph -->`,
              status: "publish",
              slug: currentSlug,
            };

            // Set parent if not at root
            if (parentId > 0) {
              placeholderData.parent = parentId;
            }

            // Create the page using Axios instead of WPAPI
            console.log(
              `Creating placeholder page with data:`,
              placeholderData
            );

            // Apply rate limiting
            await sleep(config.wordpress.rateLimitMs);

            const response = await wpAuthApi.post(
              "/wp/v2/pages",
              placeholderData
            );
            const newPage = response.data;
            parentId = newPage.id;
            console.log(`Created placeholder page with ID: ${parentId}`);
          } else {
            throw new Error(
              `Parent path segment "${currentSlug}" not found. Cannot create child page.`
            );
          }
        } else {
          console.log(
            `Found existing page for segment "${currentSlug}" with ID: ${pageId}`
          );
          parentId = pageId;
        }
      }
    }

    // Now check if the final page exists at this location
    const existingPageId = await findPageBySlug(slug, parentId);

    // If not found by slug and parent, try by full path
    if (!existingPageId) {
      // Construct the full path for this page
      const fullPath = pathSegments.join("/");
      console.log(`Trying to find page by full path: ${fullPath}`);

      // Use the more robust path finding function from pathUtils
      const { findPageByExactPath } = require("./utils/pathUtils");
      const pageByPath = await findPageByExactPath(fullPath);

      if (pageByPath) {
        console.log(
          `Found page by full path with ID ${pageByPath}, ✨ skipping creation`
        );
        return { pageId: pageByPath };
      }

      console.log(`No page found by full path, will create new page`);
    } else {
      console.log(
        `Page already exists with ID ${existingPageId}, ✨ skipping creation`
      );
      return { pageId: existingPageId };
    }

    // Prepare the page data
    const pageData = {
      title:
        title ||
        slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " "),
      content: content || "",
      status: "publish",
      slug: slug,
    };

    // Set parent ID if this isn't a root page
    if (parentId > 0) {
      pageData.parent = parentId;
      console.log(`Setting parent ID: ${parentId}`);
    } else {
      console.log(`Creating root level page: ${slug}`);
    }

    // Create the page using Axios instead of WPAPI
    console.log(`Creating new page with slug: ${slug}`);

    // Apply rate limiting
    await sleep(config.wordpress.rateLimitMs);

    const response = await wpAuthApi.post("/wp/v2/pages", pageData);
    const newPage = response.data;
    console.log(`Successfully created page with ID: ${newPage.id}`);

    return { pageId: newPage.id };
  } catch (error) {
    console.error(`Error posting to WordPress: ${error.message}`);
    if (error.response) {
      console.error(`Status code: ${error.response.status}`);
      console.error(`Response data:`, error.response.data);
    }
    throw error;
  }
}

// Function to update the parent page ID of a WordPress page
async function updateParentPage(pageId, parentPageId) {
  try {
    // Apply rate limiting
    await sleep(config.wordpress.rateLimitMs);

    // Use the authenticated wpAuthApi instance
    const response = await wpAuthApi.post(`/wp/v2/pages/${pageId}`, {
      parent: parentPageId,
    });

    console.log(`Successfully updated parent for page ID: ${pageId}`);
    logMessage(
      `Successfully updated parent for page ID: ${pageId}`,
      config.paths.apiLogFile
    );

    return response.data;
  } catch (error) {
    console.error(
      `Error updating parent for page ID ${pageId}: ${error.message}`
    );
    if (error.response) {
      console.error(`Status code: ${error.response.status}`);
      console.error(`Response data:`, error.response.data);
    }
    logMessage(
      `Error updating parent for page ID ${pageId}: ${error.message}`,
      config.paths.apiLogFile
    );
    throw error; // Re-throw to allow consistent error handling
  }
}

// Function to find a WordPress page by slug
async function findPageBySlug(slug, parentId = null) {
  console.log("\n[FIND PAGE] ---------------------");
  console.log(`Searching for page with slug: ${slug}`);
  if (parentId !== null) {
    console.log(`With parent ID: ${parentId}`);
  }

  try {
    // Normalize the slug to ensure consistent matching
    const normalizedSlug = slug.toLowerCase().trim();

    // Get all pages with this slug first - use public API since this is a read operation
    const response = await wpPublicApi.get(
      `/wp/v2/pages?slug=${normalizedSlug}`
    );
    const matchingPages = response.data;

    console.log(
      "🚀🚀🚀🚀🚀🚀 ~ findPageBySlug ~ matchingPages:",
      matchingPages
    );

    console.log(
      `Found ${matchingPages?.length || 0} pages with slug "${slug}"`
    );

    if (!matchingPages || matchingPages.length === 0) {
      console.log(`No existing page found with slug: ${slug}`);
      return null;
    }

    // If parentId is specified, find a page with the exact parent
    if (parentId !== null) {
      console.log(`Looking for page with parent ID: ${parentId}`);

      // Find the page with the matching parent
      const pageWithMatchingParent = matchingPages.find(
        (page) => page.parent === parentId
      );

      if (pageWithMatchingParent) {
        console.log(
          `Found page with ID: ${pageWithMatchingParent.id} and matching parent ID: ${parentId}`
        );
        return pageWithMatchingParent.id;
      } else {
        console.log(
          `No page found with slug "${slug}" and parent ID: ${parentId}`
        );

        // Display all found pages for debugging
        matchingPages.forEach((page) => {
          console.log(
            `- Page ID: ${page.id}, Parent: ${page.parent}, Link: ${page.link}`
          );
        });

        return null;
      }
    }

    // If no parent specified, return a page at root level first (parent=0) if available
    const rootPage = matchingPages.find((page) => page.parent === 0);
    if (rootPage) {
      console.log(
        `Found root level page with ID: ${rootPage.id} and slug "${slug}"`
      );
      return rootPage.id;
    }

    // If no specific requirements, return the first page found
    console.log(
      `Found page with ID: ${matchingPages[0].id}, Parent ID: ${matchingPages[0].parent}`
    );
    return matchingPages[0].id;
  } catch (error) {
    console.error(`Error finding page by slug: ${error.message}`);
    // Log more detailed error information
    if (error.response) {
      console.error(`Status code: ${error.response.status}`);
      console.error(`Response data:`, error.response.data);
      console.error(`Response headers:`, error.response.headers);
    }
    throw error;
  }
}

// Function to find a page by its complete path
async function findPageByPath(fullPath) {
  console.log("\n[FIND PAGE BY PATH] ---------------------");
  console.log(`Searching for page with path: ${fullPath}`);

  try {
    // Normalize the path
    const normalizedPath = fullPath.replace(/^\/|\/$/g, "");
    const pathSegments = normalizedPath.split("/").filter(Boolean);

    // If path is empty, we're looking for the home page
    if (pathSegments.length === 0) {
      console.log(`Looking for home page`);
      const homePage = await findPageBySlug("home");
      return homePage;
    }

    // Get the slug (last part of the path)
    const slug = pathSegments[pathSegments.length - 1];
    console.log(`Target slug: ${slug}`);

    // Get all pages with this slug
    const response = await wpPublicApi.get(`/wp/v2/pages?slug=${slug}`);
    const matchingPages = response.data;

    if (!matchingPages || matchingPages.length === 0) {
      console.log(`No pages found with slug: ${slug}`);
      return null;
    }

    console.log(`Found ${matchingPages.length} pages with slug "${slug}"`);

    // Check if any of the pages has a path that matches our full target path
    console.log(`👀 Performing strict hierarchy check on all candidates`);

    // For each matching page, check if its full path matches our target
    for (const page of matchingPages) {
      // Get page link and convert to path
      const pageLink = page.link;
      console.log(`Checking page ${page.id} with link: ${pageLink}`);

      // Extract path from link
      let pagePath = "";
      try {
        const url = new URL(pageLink);
        pagePath = url.pathname.replace(/^\/|\/$/g, "");
        console.log(`Extracted path: ${pagePath}`);

        // Normalize both paths for comparison (remove trailing slashes, handle empty paths)
        const normalizedPagePath = pagePath.replace(/\/$/, "");
        const targetNormalizedPath = normalizedPath.replace(/\/$/, "");

        // Split paths into segments for comparing each part
        const pagePathSegments = normalizedPagePath.split("/").filter(Boolean);
        const targetPathSegments = targetNormalizedPath
          .split("/")
          .filter(Boolean);

        // Extra logging for debugging
        console.log(`Page path segments: ${JSON.stringify(pagePathSegments)}`);
        console.log(
          `Target path segments: ${JSON.stringify(targetPathSegments)}`
        );

        // Check for exact path match only if the number of segments match
        if (pagePathSegments.length === targetPathSegments.length) {
          let isMatchingPath = true;

          // Compare each segment of the path - they must all match
          for (let i = 0; i < targetPathSegments.length; i++) {
            if (pagePathSegments[i] !== targetPathSegments[i]) {
              isMatchingPath = false;
              console.log(
                `Mismatch at segment ${i}: ${pagePathSegments[i]} vs ${targetPathSegments[i]}`
              );
              break;
            }
          }

          if (isMatchingPath) {
            console.log(`✅ Found exact path match: Page ID ${page.id}`);
            console.log(`✅ Matched path: ${normalizedPagePath}`);
            return page.id;
          }
        } else {
          console.log(
            `❌ Path segment count mismatch: ${pagePathSegments.length} vs ${targetPathSegments.length}`
          );
        }
      } catch (e) {
        console.error(`Error parsing URL: ${e.message}`);
        continue;
      }
    }

    console.log(`No page found with exact path: ${normalizedPath}`);
    return null;
  } catch (error) {
    console.error(`Error finding page by path: ${error.message}`);
    throw error;
  }
}

// Function to get the full path for a page by its ID
async function getParentPagePath(pageId) {
  console.log(`Getting full path for page ID: ${pageId}`);

  try {
    // Apply rate limiting
    await sleep(config.wordpress.rateLimitMs);

    // Get the page details using Axios instead of WPAPI
    const response = await wpPublicApi.get(`/wp/v2/pages/${pageId}`);
    const page = response.data;

    if (!page) {
      console.log(`No page found with ID: ${pageId}`);
      return null;
    }

    // Extract the path from the page link
    const pageLink = page.link;
    let pagePath = "";

    try {
      const url = new URL(pageLink);
      // Remove leading and trailing slashes
      pagePath = url.pathname.replace(/^\/|\/$/g, "");
      console.log(`Extracted path for page ID ${pageId}: ${pagePath}`);
    } catch (e) {
      console.error(`Error parsing URL: ${e.message}`);
      return null;
    }

    return pagePath;
  } catch (error) {
    console.error(`Error getting page path: ${error.message}`);
    if (error.response) {
      console.error(`Status code: ${error.response.status}`);
      console.error(`Response data:`, error.response.data);
    }
    return null;
  }
}

module.exports = {
  postToWordPress,
  updateParentPage,
  processImage,
  validateWordPressConnection,
  getParentPageSlug: (urlOrPath) => {
    let pathSegments;
    try {
      // Try parsing as a full URL first
      const parsedUrl = new URL(urlOrPath);
      pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
    } catch {
      // If URL parsing fails, treat it as a path
      pathSegments = urlOrPath.split("/").filter(Boolean);
    }
    return pathSegments.length > 1
      ? pathSegments[pathSegments.length - 2]
      : null;
  },
  findPageBySlug,
  findPageByPath,
  getParentPagePath,
  validateWordPressConnection,
};
