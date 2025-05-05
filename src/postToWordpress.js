require("dotenv").config();
const fs = require("fs");
const axios = require("axios");
const config = require("./config");
const { batchUploadImagesToWP } = require("./batchUploadImagesToWp");

// Helper function for rate limiting
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Function to log messages to a file
function logMessage(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(config.paths.apiLogFile, `[${timestamp}] ${message}\n`);
}

const wpConfig = {
  endpoint: `${config.wordpress.apiBaseUrl}wp-json`,
  username: config.wordpress.username,
  password: config.wordpress.password,
};

// Process the content of a URL and save it to a file
async function postToWordPress(post) {
  const { title, meta, slug, images } = post;
  let { content } = post;

  try {
    // Apply rate limiting
    await sleep(config.wordpress.rateLimitMs);

    // Clean the slug - remove domain and protocol
    let cleanSlug = slug.replace(/^(?:https?:\/\/)?(?:www\.)?[^\/]+\//, "");
    // Remove trailing slash if present
    cleanSlug = cleanSlug.replace(/\/$/, "");

    // Upload images to WordPress
    const uploadedImages = await batchUploadImagesToWP(images, wpConfig);

    // Replace image URLs in content
    uploadedImages.forEach((img) => {
      content = content.replace(img.originalUrl, img.wordpressUrl);
    });

    const pathSegments = cleanSlug.split("/").filter(Boolean);
    const currentSlug = pathSegments[pathSegments.length - 1];

    // If this is not a root-level page, check for parent
    if (pathSegments.length > 1) {
      const parentSlug = pathSegments.slice(0, -1).join("/");
      console.log(`Checking for parent page: ${parentSlug}`);
      const parentId = await findPageBySlug(parentSlug);

      if (!parentId) {
        console.log(
          `Parent page "${parentSlug}" not found. Skipping creation of "${currentSlug}"`
        );
        logMessage(
          `Skipped: ${currentSlug} - parent ${parentSlug} does not exist`
        );
        return null;
      }

      console.log(
        `Found parent page (ID: ${parentId}). Creating child page: ${currentSlug}`
      );

      // Apply rate limiting before creating child page
      await sleep(config.wordpress.rateLimitMs);

      // Parent exists, create the child page
      const postData = {
        title,
        content,
        slug: currentSlug,
        status: "publish",
        parent: parentId,
        meta: {
          description: meta.description,
        },
      };

      const wpResponse = await axios.post(
        `${config.wordpress.apiBaseUrl}wp-json/wp/v2/pages/`,
        postData,
        {
          headers: {
            "Content-Type": "application/json",
            "User-Agent": config.wordpress.userAgent,
          },
          auth: {
            username: config.wordpress.username,
            password: config.wordpress.password,
          },
        }
      );

      console.log(`Successfully created child page: ${wpResponse.data.id}`);
      logMessage(
        `Created child page: ${currentSlug} under parent ${parentSlug}`
      );
      return wpResponse.data.id;
    } else {
      // This is a root-level page, create it
      console.log(`Creating root-level page: ${currentSlug}`);

      // Apply rate limiting before creating root page
      await sleep(config.wordpress.rateLimitMs);

      const postData = {
        title,
        content,
        slug: currentSlug,
        status: "publish",
        meta: {
          description: meta.description,
        },
      };

      const wpResponse = await axios.post(
        `${config.wordpress.apiBaseUrl}wp-json/wp/v2/pages/`,
        postData,
        {
          headers: {
            "Content-Type": "application/json",
            "User-Agent": config.wordpress.userAgent,
          },
          auth: {
            username: config.wordpress.username,
            password: config.wordpress.password,
          },
        }
      );

      console.log(`Successfully created parent page: ${wpResponse.data.id}`);
      logMessage(`Created parent page: ${currentSlug}`);
      return wpResponse.data.id;
    }
  } catch (wpError) {
    console.error(`Error posting to WordPress: ${wpError.message}`);
    logMessage(`Error posting to WordPress: ${wpError.message}`);
    return null;
  }
}

// Function to update the parent page ID of a WordPress page
async function updateParentPage(pageId, parentPageId) {
  try {
    // Apply rate limiting
    await sleep(config.wordpress.rateLimitMs);

    await axios.post(
      `${config.wordpress.apiBaseUrl}wp-json/wp/v2/pages/${pageId}`,
      { parent: parentPageId },
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": config.wordpress.userAgent,
        },
        auth: {
          username: config.wordpress.username,
          password: config.wordpress.password,
        },
      }
    );

    console.log(`Successfully updated parent for page ID: ${pageId}`);
    logMessage(`Successfully updated parent for page ID: ${pageId}`);
  } catch (error) {
    console.error(
      `Error updating parent for page ID ${pageId}: ${error.message}`
    );
    logMessage(`Error updating parent for page ID ${pageId}: ${error.message}`);
  }
}

// Function to find a WordPress page by slug
async function findPageBySlug(slug) {
  try {
    // Apply rate limiting
    await sleep(config.wordpress.rateLimitMs);

    // Remove domain and protocol, including vancouver.wsu.edu
    slug = slug.replace(/^(?:https?:\/\/)?(?:www\.)?vancouver\.wsu\.edu\//, "");
    // Remove trailing slash if present
    slug = slug.replace(/\/$/, "");

    if (!slug) {
      console.log("🌱 Root URL detected, skipping slug check.");
      return null;
    }

    const pathSegments = slug.split("/");
    const searchSlug = pathSegments[pathSegments.length - 1];

    console.log(`\n🔍 SEARCH START -----------------------------`);
    console.log(`📂 Full path: ${slug}`);
    console.log(`🎯 Searching for: ${searchSlug}`);
    console.log(`📚 Path segments:`, pathSegments);

    const response = await axios.get(
      `${config.wordpress.apiBaseUrl}wp-json/wp/v2/pages`,
      {
        params: {
          slug: searchSlug,
          per_page: 1,
        },
        headers: {
          "User-Agent": config.wordpress.userAgent,
        },
        auth: {
          username: config.wordpress.username,
          password: config.wordpress.password,
        },
      }
    );

    if (response.data && response.data.length > 0) {
      const foundPage = response.data[0];
      console.log(`✅ Found page ID: ${foundPage.id} for: ${searchSlug}`);
      console.log(`👆 Page's parent ID: ${foundPage.parent || "none"}`);

      if (pathSegments.length > 1) {
        const parentSlug = pathSegments[pathSegments.length - 2];
        console.log(`👀 Looking for parent: ${parentSlug}`);

        if (foundPage.parent) {
          // Apply rate limiting before fetching parent
          await sleep(config.wordpress.rateLimitMs);

          const parentResponse = await axios.get(
            `${config.wordpress.apiBaseUrl}wp-json/wp/v2/pages/${foundPage.parent}`,
            {
              headers: {
                "User-Agent": config.wordpress.userAgent,
              },
              auth: {
                username: config.wordpress.username,
                password: config.wordpress.password,
              },
            }
          );

          console.log(`📌 Found parent slug: ${parentResponse.data.slug}`);
          console.log(`🎯 Expected parent: ${parentSlug}`);

          if (parentResponse.data.slug === parentSlug) {
            console.log(`✅ Parent match confirmed!`);
            return foundPage.id;
          } else {
            console.log(`❌ Parent mismatch`);
          }
        } else {
          console.log(`⚠️ Page has no parent`);
        }
      } else {
        return foundPage.id;
      }
    }
    console.log(`❌ No page found for: ${searchSlug}`);
    console.log(`🔍 SEARCH END -------------------------------\n`);
    return null;
  } catch (error) {
    console.error(`💥 Error finding page ${slug}:`, error.message);
    return null;
  }
}

module.exports = {
  postToWordPress,
  updateParentPage,
  getParentPageSlug: (url) => {
    const parsedUrl = new URL(url);
    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
    return pathSegments.length > 1
      ? pathSegments[pathSegments.length - 2]
      : null;
  },
  findPageBySlug,
};
