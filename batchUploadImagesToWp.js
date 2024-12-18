const WPAPI = require("wpapi");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

async function batchUploadImagesToWP(imageUrls) {
  // Initialize WordPress API
  const wp = new WPAPI({
    endpoint: `${process.env.WP_API_BASE_URL}wp-json`,
    username: process.env.WP_API_USERNAME,
    password: process.env.WP_API_PASSWORD,
    auth: true,
  });

  // Set the User-Agent header
  wp.setHeaders({
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36",
  });

  const downloadFile = async (imageUrl) => {
    const fileName = path.basename(imageUrl);
    const filePath = path.join(process.cwd(), fileName);
    // console.log("Starting download for URL:", imageUrl);
    // console.log("Saving to path:", filePath);

    return new Promise((resolve, reject) => {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          // console.log(`Deleted existing file: ${filePath}`);
        } catch (err) {
          console.error(`Error deleting existing file: ${err}`);
        }
      }

      exec(`curl -o "${filePath}" "${imageUrl}"`, (error, stdout, stderr) => {
        if (error) {
          console.error("Download error:", error);
          reject(error);
          return;
        }

        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          console.log(`Downloaded file size: ${stats.size} bytes`);
          resolve(filePath);
        } else {
          reject(new Error(`File not found after download: ${filePath}`));
        }
      });
    });
  };

  const uploadToWordPress = async (filePath, image, postId = null) => {
    try {
      const fileName = path.basename(filePath);

      console.log(`Uploading ${fileName} to WordPress...`);

      const response = await wp
        .media()
        .file(filePath) // Use the file path directly
        .create({
          title: fileName,
          alt_text:
            image.alt || `No alt text. Image originally from: ${image.url}`,
          caption: "",
          description: `Image originally from: ${image.url}`,
        });

      // Add post association if postId is provided
      if (postId) {
        updateData.post = postId;
      }

      // Clean up the downloaded file
      fs.unlinkSync(filePath);

      return {
        image: image.url,
        originalUrl: image.url,
        originalName: fileName,
        wordpressUrl: response.source_url,
        mediaId: response.id,
        postId: response.post || null,
      };
    } catch (error) {
      console.error(`Upload error for ${filePath}:`, {
        message: error.message,
        code: error.code,
        data: error.data,
      });
      throw error;
    }
  };

  const results = [];
  const errors = [];

  for (const image of imageUrls) {
    try {
      // console.log(`\n--- Processing image: ${image.url} ---`);
      const filePath = await downloadFile(image.url);
      // console.log(`Successfully downloaded to: ${filePath}`);
      const uploadResult = await uploadToWordPress(filePath, image);
      // console.log(
      //   `Successfully uploaded to WordPress: ${uploadResult.wordpressUrl}`
      // );
      results.push(uploadResult);
    } catch (error) {
      console.error(`Error processing ${image.url}:`, error);
      errors.push({
        url: image.url,
        error: error.message,
      });
    }
  }

  if (errors.length > 0) {
    console.error("Some uploads failed:", errors);
  }

  return results;
}

module.exports = { batchUploadImagesToWP };
