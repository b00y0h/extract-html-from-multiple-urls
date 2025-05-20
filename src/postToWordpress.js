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
async function postToWordPress(url, content, title) {
  console.log("\n[POST TO WORDPRESS] ---------------------");
  console.log(`Processing URL: ${url}`);
  console.log(`Title: ${title}`);

  try {
    // Handle if url is an object with originalUrl property
    const urlStr = typeof url === "object" ? url.originalUrl || url.url : url;
    if (!urlStr || typeof urlStr !== "string") {
      throw new Error(`Invalid URL provided: ${JSON.stringify(url)}`);
    }

    // Get the slug from the URL
    const pathSegments = urlStr.split("/").filter(Boolean);
    const slug = pathSegments[pathSegments.length - 1] || "home";
    console.log(`Using slug: ${slug}`);

    // First check if page already exists
    const existingPageId = await findPageBySlug(slug);
    if (existingPageId) {
      console.log(
        `Page already exists with ID ${existingPageId}, skipping creation`
      );
      return existingPageId;
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

    // Handle parent pages
    if (pathSegments.length > 1) {
      // This is a child page, get its parent
      const parentSlug = pathSegments[pathSegments.length - 2];
      console.log(`Looking for parent page with slug: ${parentSlug}`);

      const parentId = await findPageBySlug(parentSlug);
      if (!parentId) {
        throw new Error(
          `Parent page with slug "${parentSlug}" not found. Cannot create child page.`
        );
      }

      pageData.parent = parentId;
      console.log(`Setting parent ID: ${parentId}`);
    } else {
      console.log(`Creating root level page: ${slug}`);
    }

    // Create the page
    console.log(`Creating new page with slug: ${slug}`);
    const newPage = await wp.pages().create(pageData);
    console.log(`Successfully created page with ID: ${newPage.id}`);

    return newPage.id;
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
async function findPageBySlug(slug) {
  console.log("\n[FIND PAGE] ---------------------");
  console.log(`Searching for page with slug: ${slug}`);

  try {
    // Normalize the slug to ensure consistent matching
    const normalizedSlug = slug.toLowerCase().trim();

    // Search specifically for the page with this slug
    const matchingPages = await wp.pages().param("slug", normalizedSlug);

    if (matchingPages && matchingPages.length > 0) {
      const existingPage = matchingPages[0];
      console.log(`Found existing page with ID: ${existingPage.id}`);
      return existingPage.id;
    }

    console.log(`No existing page found with slug: ${slug}`);
    return null;
  } catch (error) {
    console.error(`Error finding page by slug: ${error.message}`);
    throw error;
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
};
