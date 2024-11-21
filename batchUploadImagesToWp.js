const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

async function batchUploadImagesToWP(imageUrls) {
  const downloadFile = async (imageUrl) => {
    const fileName = path.basename(imageUrl);
    const filePath = path.join(process.cwd(), fileName);
    console.log("Starting download for URL:", imageUrl);
    console.log("Saving to path:", filePath);

    return new Promise((resolve, reject) => {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`Deleted existing file: ${filePath}`);
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

  const uploadToWordPress = async (filePath, originalUrl) => {
    try {
      const fileName = path.basename(filePath);
      let data = new FormData();
      data.append("file", fs.createReadStream(filePath));
      const auth = {
        username: process.env.WP_API_USERNAME,
        password: process.env.WP_API_PASSWORD,
      };
      let config = {
        method: "post",
        url: `${process.env.WP_API_BASE_URL}wp-json/wp/v2/media/`,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36",
          ...data.getHeaders(),
        },
        auth: auth,
        data: data,
      };

      console.log(`Uploading ${fileName} to WordPress...`);

      // Create custom axios instance to prevent default headers
      const instance = axios.create();
      instance.defaults.headers.common = {};

      const response = await instance.request(config);

      // Clean up the downloaded file
      fs.unlinkSync(filePath);

      return {
        originalUrl: originalUrl,
        originalName: fileName,
        wordpressUrl: response.data.guid.rendered,
        mediaId: response.data.id,
      };
    } catch (error) {
      console.error(`Upload error for ${filePath}:`, {
        message: error.message,
        status: error.response?.status,
      });
      throw error;
    }
  };

  const results = [];
  const errors = [];

  for (const imageUrl of imageUrls) {
    try {
      console.log(`\n--- Processing image: ${imageUrl} ---`);
      const filePath = await downloadFile(imageUrl);
      console.log(`Successfully downloaded to: ${filePath}`);
      const uploadResult = await uploadToWordPress(filePath, imageUrl);
      console.log(
        `Successfully uploaded to WordPress: ${uploadResult.wordpressUrl}`
      );
      results.push(uploadResult);
    } catch (error) {
      console.error(`Error processing ${imageUrl}:`, error);
      errors.push({
        url: imageUrl,
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
