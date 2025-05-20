const axios = require("axios");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { logMessage } = require("./utils/logs");
const config = require("./config");

// Helper function for rate limiting
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function batchUploadImagesToWP(images, wpConfig) {
  const results = [];
  console.log(
    `DEBUG: batchUploadImagesToWP called with ${images.length} images`
  );

  for (const image of images) {
    try {
      // Skip if image URL is undefined or null
      if (!image?.url) {
        console.log("Skipping undefined/null image URL");
        continue;
      }

      console.log(`DEBUG: Processing image URL: ${image.url}`);
      let buffer;
      let contentType;
      let fileName;

      // Handle local file URLs
      if (image.url.startsWith("file://")) {
        const localPath = image.url.replace("file://", "");
        console.log(`DEBUG: Local file path: ${localPath}`);

        if (!fs.existsSync(localPath)) {
          console.error(`DEBUG: Local file not found: ${localPath}`);
          throw new Error(`Local file not found: ${localPath}`);
        }

        try {
          buffer = fs.readFileSync(localPath);
          console.log(
            `DEBUG: Successfully read file, size: ${buffer.length} bytes`
          );

          // Determine content type from file extension
          const ext = path.extname(localPath).slice(1).toLowerCase();
          if (ext === "jpg" || ext === "jpeg") {
            contentType = "image/jpeg";
          } else if (ext === "png") {
            contentType = "image/png";
          } else if (ext === "gif") {
            contentType = "image/gif";
          } else if (ext === "webp") {
            contentType = "image/webp";
          } else {
            contentType = `image/${ext}`;
          }

          fileName = path.basename(localPath);
        } catch (readError) {
          console.error(`DEBUG: Error reading file: ${readError.message}`);
          throw readError;
        }
      } else {
        console.error(`DEBUG: Invalid image URL format: ${image.url}`);
        throw new Error(
          `Invalid image URL format. Expected a local file URL starting with file://, got: ${image.url}`
        );
      }

      // Apply rate limiting before WordPress media upload
      await sleep(config.wordpress.rateLimitMs);

      console.log(`🚀 Uploading to WordPress: ${fileName}`);

      try {
        // Upload to WordPress
        const uploadResponse = await axios.post(
          `${wpConfig.endpoint}/wp/v2/media`,
          buffer,
          {
            headers: {
              "Content-Type": contentType,
              "Content-Disposition": `attachment; filename="${fileName}"`,
              "User-Agent": config.wordpress.userAgent,
            },
            auth: {
              username: wpConfig.username,
              password: wpConfig.password,
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            timeout: 30000, // 30 second timeout
          }
        );

        results.push({
          originalUrl: image.url,
          wordpressUrl: uploadResponse.data.source_url,
          id: uploadResponse.data.id,
        });

        logMessage(
          `Successfully uploaded image to WordPress: ${image.url} -> ${uploadResponse.data.source_url}`
        );
      } catch (uploadError) {
        console.error(`DEBUG: Upload error: ${uploadError.message}`);
        if (uploadError.response) {
          console.error(
            `DEBUG: Response status: ${uploadError.response.status}`
          );
          console.error(`DEBUG: Response data:`, uploadError.response.data);
        }
        throw uploadError;
      }
    } catch (error) {
      // console.error(`Error processing image ${image.url}:`, error.message);
      // if (error.response) {
      //   console.error(`Response status: ${error.response.status}`);
      //   console.error(`Response data:`, error.response.data);
      // }
      logMessage(`Error processing image ${image.url}: ${error.message}`);
    }
  }
  return results;
}

module.exports = { batchUploadImagesToWP };
