/**
 * Get or find pages with path support for WordPress hierarchical slugs
 * This utility helps find WordPress pages by their hierarchical path
 */

const WPAPI = require("wpapi");
const config = require("../config");
const { logMessage } = require("./logs");

// Initialize WordPress API client
const wp = new WPAPI({
  endpoint: config.wordpress.apiBaseUrl,
  username: config.wordpress.username,
  password: config.wordpress.password,
});

/**
 * Find a page by its complete hierarchical path
 *
 * @param {string} path - The complete path to the page (e.g., "academics/library/about")
 * @returns {Promise<{id: number, title: string} | null>} - Page ID and title or null if not found
 */
async function findPageByFullPath(path) {
  try {
    // Normalize path by removing leading and trailing slashes
    const normalizedPath = path.replace(/^\/+|\/+$/g, "");

    // Split the path into segments to understand the hierarchy
    const pathSegments = normalizedPath.split("/");

    // The last segment is the actual page slug we're looking for
    const pageSlug = pathSegments[pathSegments.length - 1];

    logMessage(
      `Looking for page with slug "${pageSlug}" in path "${normalizedPath}"`,
      config.paths.createMenuLogFile
    );

    // Find all pages with this slug - there could be multiple with the same slug in different sections
    const matchingPages = await wp.pages().param("slug", pageSlug).get();

    if (!matchingPages || matchingPages.length === 0) {
      logMessage(
        `No pages found with slug "${pageSlug}"`,
        config.paths.createMenuLogFile
      );
      return null;
    }

    // If path has multiple segments, verify the hierarchy
    if (pathSegments.length > 1) {
      for (const page of matchingPages) {
        let currentPage = page;
        let hierarchyMatches = true;
        let currentPageChain = [pageSlug]; // Start with the found page's slug

        // Build the parent chain to verify it matches our path
        let parentId = currentPage.parent;

        // We're checking all segments except the last one (which is the page we already found)
        for (let i = pathSegments.length - 2; i >= 0; i--) {
          // If we've reached the top of the hierarchy too early, it's not a match
          if (!parentId) {
            hierarchyMatches = false;
            break;
          }

          try {
            // Get the parent page
            const parent = await wp.pages().id(parentId).get();

            // Check if this parent's slug matches the expected path segment
            if (parent.slug !== pathSegments[i]) {
              hierarchyMatches = false;
              break;
            }

            // Add to our chain for logging
            currentPageChain.unshift(parent.slug);

            // Move up one level
            parentId = parent.parent;
          } catch (error) {
            logMessage(
              `Error retrieving parent page: ${error.message}`,
              config.paths.createMenuLogFile
            );
            hierarchyMatches = false;
            break;
          }
        }

        // If we found a match with the correct hierarchy, return it
        if (hierarchyMatches) {
          logMessage(
            `Found matching page with ID ${page.id}, title "${
              page.title.rendered
            }" at path: ${currentPageChain.join("/")}`,
            config.paths.createMenuLogFile
          );
          return {
            id: page.id,
            title: page.title.rendered,
          };
        }
      }

      // If we checked all pages and found no hierarchy match, log it
      logMessage(
        `Found ${matchingPages.length} pages with slug "${pageSlug}" but none match the full path "${normalizedPath}"`,
        config.paths.createMenuLogFile
      );

      // For multi-segment paths, try to be smarter about matching
      // First, check if any of these pages have the expected path in their links
      for (const page of matchingPages) {
        try {
          // Parse the page URL to get its path
          const pageUrl = new URL(page.link);
          const pagePath = pageUrl.pathname.replace(/^\/|\/$/g, "");

          // If the path ends with our normalized path, it's probably a match
          if (pagePath.endsWith(normalizedPath)) {
            logMessage(
              `Found page with matching URL path ${pagePath}, ID ${page.id}, title "${page.title.rendered}"`,
              config.paths.createMenuLogFile
            );
            return {
              id: page.id,
              title: page.title.rendered,
            };
          }
        } catch (error) {
          // Skip URL parsing errors
          continue;
        }
      }
    } else {
      // For single-segment paths, we need to make sure it's a top-level page
      // And not a page that happens to have the same slug in a different hierarchy

      // First, strictly look for top-level pages (parent ID = 0)
      const topLevelPages = matchingPages.filter((page) => page.parent === 0);

      if (topLevelPages.length > 0) {
        // We found at least one top-level page with this slug
        const page = topLevelPages[0];
        logMessage(
          `Found top-level page with ID ${page.id}, title "${page.title.rendered}" for path "${normalizedPath}"`,
          config.paths.createMenuLogFile
        );
        return {
          id: page.id,
          title: page.title.rendered,
        };
      }

      // If we get here, we didn't find a top-level page with this slug
      logMessage(
        `No top-level page found with slug "${pageSlug}"`,
        config.paths.createMenuLogFile
      );

      // For top-level paths, we should NOT fall back to a non-top-level page
      // as this is likely not what the user intended
      return null;
    }

    // If we reach here, we didn't find a page with the correct hierarchy
    return null;
  } catch (error) {
    logMessage(
      `Error in findPageByFullPath: ${error.message}`,
      config.paths.createMenuLogFile
    );
    return null;
  }
}

module.exports = {
  findPageByFullPath,
};
