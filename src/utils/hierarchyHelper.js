// Helper function to create a missing level in the hierarchy
async function createHierarchyLevel(slug, parentId) {
  console.log(
    `Creating missing hierarchy level: ${slug} with parent: ${parentId}`
  );

  const { postToWordPress } = require("../postToWordpress");

  // Create a placeholder page for this hierarchy level
  const title = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
  const placeholderContent = `<!-- wp:paragraph --><p>This is a placeholder page for ${title}.</p><!-- /wp:paragraph -->`;

  // Get the full parent path to ensure correct hierarchy placement
  let urlPath = slug;

  if (parentId > 0) {
    try {
      // Use Axios instead of WPAPI for API calls
      const axios = require("axios");
      const https = require("https");
      const config = require("../config");

      // Helper function to create an axios instance
      function createWpAxios(requiresAuth = true) {
        const instance = axios.create({
          baseURL: config.wordpress.apiEndpointUrl,
          headers: {
            "User-Agent": config.wordpress.userAgent,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          httpsAgent: new https.Agent({
            rejectUnauthorized: false,
          }),
          timeout: 10000,
        });

        // Add authentication if required
        if (
          requiresAuth &&
          config.wordpress.username &&
          config.wordpress.password
        ) {
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

      // Get the parent page to determine its full path
      const response = await wpPublicApi.get(`/wp/v2/pages/${parentId}`);
      const parentPage = response.data;

      if (parentPage && parentPage.link) {
        // Extract the path from the URL
        const url = new URL(parentPage.link);
        const parentPath = url.pathname.replace(/^\/|\/$/g, ""); // Remove leading/trailing slashes

        // Construct the full path including the new slug
        urlPath = parentPath ? `${parentPath}/${slug}` : slug;
        console.log(`Constructed full URL path: ${urlPath}`);
      } else {
        console.log(`Could not get parent page info, using slug only: ${slug}`);
      }
    } catch (error) {
      console.error(`Error getting parent page path: ${error.message}`);
      // Fallback to simple path
      urlPath = slug;
    }
  }

  // Create the page
  const result = await postToWordPress(
    urlPath,
    placeholderContent,
    title,
    "Create"
  );

  const pageId = result.pageId;

  console.log(`Created hierarchy level "${slug}" with ID: ${pageId}`);
  return pageId;
}

module.exports = { createHierarchyLevel };
