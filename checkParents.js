const axios = require("axios");
const https = require("https");
const config = require("./src/config");

// Helper function to create an axios instance with proper auth and configuration
function createWpAxios(requiresAuth = true) {
  const instance = axios.create({
    baseURL: config.wordpress.apiEndpointUrl,
    headers: {
      "User-Agent": config.wordpress.userAgent || "WordPress API Client",
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

// Create axios instance for public API requests
const wpPublicApi = createWpAxios(false);

async function checkParents(slug = "about", action) {
  try {
    const response = await wpPublicApi.get("/wp/v2/pages", {
      params: { slug },
    });
    const pages = response.data;
    console.log("🚀 ~ checkParents ~ pages:", pages);
  } catch (error) {
    console.error("Error:", error.message);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
    }
  }
}

checkParents();
