require("dotenv").config();
const fs = require("fs");
const axios = require("axios");
const { batchUploadImagesToWP } = require("./batchUploadImagesToWp");

const WP_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36";
const WP_API_BASE_URL =
  process.env.WP_API_BASE_URL || "https://wsuwp.vancouver.wsu.edu/eab/";
const LOG_FILE = "API_log.txt";

// Function to log messages to a file
function logMessage(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
}

const wpConfig = {
  endpoint: `${WP_API_BASE_URL}wp-json`,
  username: process.env.WP_API_USERNAME,
  password: process.env.WP_API_PASSWORD,
};
// Process the content of a URL and save it to a file
async function postToWordPress(post) {
  const { title, meta, slug, images } = post;
  let { content } = post; // Destructure content separately so we can modify it

  try {
    // Upload images to WordPress
    const uploadedImages = await batchUploadImagesToWP(images, wpConfig);

    // Replace image URLs in content
    uploadedImages.forEach((img) => {
      content = content.replace(img.originalUrl, img.wordpressUrl);
    });

    const postData = {
      title,
      content,
      slug,
      status: "publish",
      meta: {
        description: meta.description,
      },
    };

    const auth = {
      username: process.env.WP_API_USERNAME,
      password: process.env.WP_API_PASSWORD,
    };

    const wpResponse = await axios.post(
      `${WP_API_BASE_URL}wp-json/wp/v2/pages/`,
      postData,
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": WP_USER_AGENT,
        },
        auth: auth,
      }
    );

    console.log(`Successfully posted to WordPress: ${wpResponse.data.id}`);
    logMessage(`Successfully posted to WordPress: ${wpResponse.data.id}`);
    return wpResponse.data.id;
  } catch (wpError) {
    console.error(`Error posting to WordPress: ${wpError.message}`);
    logMessage(`Error posting to WordPress: ${wpError.message}`);
    return null;
  }
}

// Function to update the parent page ID of a WordPress page
async function updateParentPage(pageId, parentPageId) {
  try {
    const auth = {
      username: process.env.WP_API_USERNAME,
      password: process.env.WP_API_PASSWORD,
    };

    await axios.post(
      `${WP_API_BASE_URL}wp-json/wp/v2/pages/${pageId}`,
      { parent: parentPageId },
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": WP_USER_AGENT,
        },
        auth: auth,
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

// Function to extract the parent page slug from a URL
function getParentPageSlug(url) {
  const parsedUrl = new URL(url);
  const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
  return pathSegments.length > 1 ? pathSegments[pathSegments.length - 2] : null;
}

module.exports = { postToWordPress, updateParentPage, getParentPageSlug };
