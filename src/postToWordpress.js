require("dotenv").config();
const fs = require("fs");
const axios = require("axios");
const https = require("https");
const config = require("./config");
const { batchUploadImagesToWP } = require("./batchUploadImagesToWp");
const path = require("path");
const { logMessage } = require("./utils/logs");
const WPAPI = require("wpapi");

// Initialize the WordPress API client
const wp = new WPAPI({
  endpoint: config.wordpress.apiBaseUrl,
  username: config.wordpress.username,
  password: config.wordpress.password,
});

// Helper function for rate limiting
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const wpConfig = {
  endpoint: config.wordpress.apiBaseUrl,
  username: config.wordpress.username,
  password: config.wordpress.password,
};

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

            // Create placeholder page
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

            // Create the page
            console.log(
              `Creating placeholder page with data:`,
              placeholderData
            );
            const newPage = await wp.pages().create(placeholderData);
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

    // Create the page
    console.log(`Creating new page with slug: ${slug}`);
    const newPage = await wp.pages().create(pageData);
    console.log(`Successfully created page with ID: ${newPage.id}`);

    return { pageId: newPage.id };
  } catch (error) {
    console.error(`Error posting to WordPress: ${error.message}`);
    throw error;
  }
}

// Function to update the parent page ID of a WordPress page
async function updateParentPage(pageId, parentPageId) {
  try {
    // Apply rate limiting
    await sleep(config.wordpress.rateLimitMs);

    await axios.post(
      `${wpConfig.endpoint}/wp/v2/pages/${pageId}`,
      { parent: parentPageId },
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": config.wordpress.userAgent,
        },
        auth: {
          username: wpConfig.username,
          password: wpConfig.password,
        },
      }
    );

    console.log(`Successfully updated parent for page ID: ${pageId}`);
    logMessage(
      `Successfully updated parent for page ID: ${pageId}`,
      config.paths.apiLogFile
    );
  } catch (error) {
    console.error(
      `Error updating parent for page ID ${pageId}: ${error.message}`
    );
    logMessage(
      `Error updating parent for page ID ${pageId}: ${error.message}`,
      config.paths.apiLogFile
    );
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

    // Get all pages with this slug first
    const matchingPages = await wp.pages().slug(normalizedSlug);

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
    const matchingPages = await wp.pages().slug(slug);

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
    // Get the page details
    const page = await wp.pages().id(pageId).get();

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
    return null;
  }
}

module.exports = {
  postToWordPress,
  updateParentPage,
  processImage,
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
};
