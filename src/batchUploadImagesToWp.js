const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { logMessage } = require("./utils/logs");
const config = require("./config");

// Helper function for rate limiting
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function batchUploadImagesToWP(images, wpConfig) {
  const results = [];

  for (const image of images) {
    try {
      // Apply rate limiting between image uploads
      await sleep(config.wordpress.rateLimitMs);

      const response = await axios.get(image.url, {
        responseType: "arraybuffer",
        headers: {
          "User-Agent": config.wordpress.userAgent,
        },
      });

      const buffer = Buffer.from(response.data, "binary");
      const fileName = path.basename(image.url);
      const filePath = path.join(config.paths.imagesDir, fileName);

      // Save the image to the images directory
      fs.writeFileSync(filePath, buffer);

      // Apply rate limiting before WordPress media upload
      await sleep(config.wordpress.rateLimitMs);

      const uploadResponse = await axios.post(
        `${wpConfig.endpoint}/wp/v2/media`,
        buffer,
        {
          headers: {
            "Content-Type": response.headers["content-type"],
            "Content-Disposition": `attachment; filename="${fileName}"`,
            "User-Agent": config.wordpress.userAgent,
          },
          auth: {
            username: wpConfig.username,
            password: wpConfig.password,
          },
        }
      );

      results.push({
        originalUrl: image.url,
        localPath: filePath,
        wordpressUrl: uploadResponse.data.source_url,
        id: uploadResponse.data.id,
      });

      logMessage(
        `Successfully downloaded image to ${filePath} and uploaded to WordPress: ${image.url} -> ${uploadResponse.data.source_url}`
      );
    } catch (error) {
      console.error(`Error processing image ${image.url}:`, error.message);
      logMessage(`Error processing image ${image.url}: ${error.message}`);
    }
  }

  return results;
}

module.exports = { batchUploadImagesToWP };
