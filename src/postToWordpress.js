require("dotenv").config();
const fs = require("fs");
const axios = require("axios");
const https = require("https");
const config = require("./config");
const { batchUploadImagesToWP } = require("./batchUploadImagesToWp");
const path = require("path");
const { logMessage } = require("./utils/logs");

// Helper function for rate limiting
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const wpConfig = {
  endpoint: config.wordpress.apiBaseUrl,
  username: config.wordpress.username,
  password: config.wordpress.password,
};

// Process an individual image
async function processImage(image) {
  console.log(`DEBUG: Image directory path: ${config.paths.imagesDir}`);
  console.log(
    `DEBUG: Directory exists: ${fs.existsSync(config.paths.imagesDir)}`
  );

  if (!image?.url) {
    throw new Error("Image URL is undefined or null");
  }

  console.log(`📸 Processing image: ${image.url}`);

  try {
    // Save the original URL and ensure it's properly encoded for axios
    const originalUrl = image.url;
    const encodedUrl = encodeURI(decodeURIComponent(originalUrl));
    console.log(`🔄 Encoded URL: ${encodedUrl}`);

    // Generate filename from original URL to preserve the original name
    const fileName = decodeURIComponent(originalUrl).split("/").pop();
    const localPath = path.join(config.paths.imagesDir, fileName);
    console.log(`DEBUG: Local path for image: ${localPath}`);

    // Ensure the images directory exists - IMPORTANT FIX
    if (!fs.existsSync(config.paths.imagesDir)) {
      console.log(
        `DEBUG: Creating images directory: ${config.paths.imagesDir}`
      );
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
      console.log(`DEBUG: Attempting to download image from: ${encodedUrl}`);
      console.log(`DEBUG: Saving to local path: ${localPath}`);

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
    console.log(`DEBUG: batchUploadImagesToWP results:`, results);

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
async function postToWordPress(post) {
  try {
    const {
      title,
      content,
      status,
      slug,
      images: providedImages,
      featuredMediaId: providedFeaturedMediaId,
      successfulMedia: providedSuccessfulMedia,
    } = post;

    // First check if a page with this slug already exists
    console.log(`🔍 Checking if page with slug "${slug}" already exists...`);
    const existingPageId = await findPageBySlug(slug);
    if (existingPageId) {
      console.log(
        `⚠️ Page with slug "${slug}" already exists (ID: ${existingPageId})`
      );
      return existingPageId;
    }
    console.log(`✅ Slug "${slug}" is available for new page`);

    let formattedContent = content;
    let featuredMediaId = providedFeaturedMediaId || null;
    let successfulMedia = providedSuccessfulMedia || [];

    // Clean up any malformed block tags
    formattedContent = formattedContent.replace(/<!--\s*wp:/g, "<!-- wp:");
    formattedContent = formattedContent.replace(/\s*\/-->/g, " -->");

    // Split the slug into path segments
    const pathSegments = slug.split("/").filter(Boolean);

    // If this is not a root page, ensure parent exists
    let parentId = null;
    if (pathSegments.length > 1) {
      const parentSlug = pathSegments[pathSegments.length - 2];
      const parentPath = pathSegments.slice(0, -1).join("/");

      console.log(`🔍 Checking for parent page: ${parentPath}`);
      parentId = await findPageBySlug(parentPath);

      // If parent doesn't exist, create it
      if (!parentId) {
        console.log(`📝 Creating parent page: ${parentPath}`);
        parentId = await postToWordPress({
          title:
            parentSlug.charAt(0).toUpperCase() +
            parentSlug.slice(1).replace(/-/g, " "),
          content: "",
          status: "publish",
          slug: parentPath,
        });
      }
    }

    const postData = {
      title,
      content: formattedContent,
      status: status || "publish",
      slug: pathSegments[pathSegments.length - 1],
      parent: parentId || 0,
    };

    if (featuredMediaId) {
      postData.featured_media = featuredMediaId;
    }

    // Apply rate limiting before WordPress API request
    await sleep(config.wordpress.rateLimitMs);

    // Create the WordPress post
    const apiUrl = `${wpConfig.endpoint}/wp/v2/pages`;
    console.log("📤 Sending request to WordPress API:", apiUrl);

    const response = await axios.post(apiUrl, postData, {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": config.wordpress.userAgent,
      },
      auth: {
        username: wpConfig.username,
        password: wpConfig.password,
      },
      maxRedirects: 5,
      timeout: 30000, // 30 second timeout
    });

    if (!response.data || !response.data.id) {
      throw new Error("WordPress API response did not include a post ID");
    }

    // Update post_parent for all media attachments
    if (successfulMedia.length > 0) {
      await Promise.all(
        successfulMedia.map(async (media) => {
          try {
            await sleep(config.wordpress.rateLimitMs);
            await axios.post(
              `${wpConfig.endpoint}/wp/v2/media/${media.id}`,
              { post: response.data.id },
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
            console.log(`✅ Updated post_parent for media ID: ${media.id}`);
          } catch (error) {
            console.error(
              `Error updating media attachment ${media.id}: ${error.message}`
            );
          }
        })
      );
    }

    console.log(`✅ Successfully created page with ID: ${response.data.id}`);
    logMessage(
      `Successfully created page with ID: ${response.data.id}`,
      config.paths.apiLogFile
    );
    return response.data.id;
  } catch (error) {
    console.error(`❌ Error creating WordPress page: ${error.message}`);
    console.error(`Stack trace: ${error.stack}`);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error(
        "Response data:",
        JSON.stringify(error.response.data, null, 2)
      );
    }
    logMessage(
      `Error creating WordPress page: ${error.message}`,
      config.paths.apiLogFile
    );
    return null;
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
  console.log("🔍 Input slug:", slug);
  try {
    // Apply rate limiting
    await sleep(config.wordpress.rateLimitMs);

    // Only clean the slug if it looks like a URL
    if (slug.includes("://") || slug.startsWith("//")) {
      slug = slug.replace(/^(?:https?:\/\/)?(?:[^\/]+)/, ""); // Remove domain part only if it's a URL
    }
    slug = slug.replace(/^\/+|\/+$/g, ""); // Remove leading/trailing slashes
    console.log("🔍 Cleaned slug:", slug);

    if (!slug) {
      console.log("🌱 Empty slug detected, skipping slug check.");
      return null;
    }

    const pathSegments = slug.split("/").filter(Boolean);
    const searchSlug = pathSegments[pathSegments.length - 1];

    console.log(`\n🔍 SEARCH START -----------------------------`);
    console.log(`📂 Full path: ${slug}`);
    console.log(`🎯 Searching for: ${searchSlug}`);
    console.log(`📚 Path segments:`, pathSegments);

    // Construct the full API URL properly
    const apiUrl = `${config.wordpress.apiBaseUrl}/wp-json/wp/v2/pages`;
    console.log(`🔗 Using API URL: ${apiUrl}`);

    // Search for all pages with this slug - we might have multiple matches
    const response = await axios.get(apiUrl, {
      params: {
        slug: searchSlug,
        per_page: 100, // Get all possible matches
      },
      headers: {
        "User-Agent": config.wordpress.userAgent,
      },
      auth: {
        username: wpConfig.username,
        password: wpConfig.password,
      },
    });

    if (response.data && response.data.length > 0) {
      // Check if any page exists with this slug
      if (pathSegments.length === 1) {
        // For root pages, return the first one found with this slug
        console.log(`✅ Found existing page with slug "${searchSlug}", ID: ${response.data[0].id}`);
        return response.data[0].id;
      }
      // For nested pages, verify the full path matches
      else {
        for (const page of response.data) {
          // Get the full path of this page by traversing up the parent chain
          const pagePathSegments = [searchSlug];
          let currentPage = page;

          while (currentPage.parent !== 0) {
            await sleep(config.wordpress.rateLimitMs); // Rate limiting for parent lookup
            const parentResponse = await axios.get(
              `${apiUrl}/${currentPage.parent}`,
              {
                headers: { "User-Agent": config.wordpress.userAgent },
                auth: {
                  username: wpConfig.username,
                  password: wpConfig.password,
                },
              }
            );
            currentPage = parentResponse.data;
            pagePathSegments.unshift(currentPage.slug);
          }

          const pagePath = pagePathSegments.join("/");
          if (pagePath === slug) {
            console.log(`✅ Found exact path match with ID: ${page.id}`);
            return page.id;
          }
        }
      }
    }

    console.log(`❌ No matching page found for: ${searchSlug}`);
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
