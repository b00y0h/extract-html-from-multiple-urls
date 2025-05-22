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
      // Get the WordPress API instance from the main module
      const WPAPI = require("wpapi");
      const config = require("../config");

      const wp = new WPAPI({
        endpoint: config.wordpress.apiBaseUrl,
        username: config.wordpress.username,
        password: config.wordpress.password,
      });

      // Get the parent page to determine its full path
      const parentPage = await wp.pages().id(parentId).get();

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
