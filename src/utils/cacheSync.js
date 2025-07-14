/**
 * This module provides functionality to synchronize WordPress page data
 * with the page cache to improve hierarchy verification.
 */

const { cachePage, cachePages, getPageFromCache } = require("./pageCache");

/**
 * Synchronize the page cache with spreadsheet data
 * @param {Array} urls - Array of URL objects from the spreadsheet
 */
async function syncCacheWithSpreadsheet(urls) {
  console.log("\n🔄 Synchronizing page cache with spreadsheet data...");
  let cacheCount = 0;

  // Filter URLs that have already been processed and have pageIds
  const processedUrls = urls.filter((url) => url.pageId && url.pageId > 0);

  console.log(
    `Found ${processedUrls.length} processed URLs with page IDs in spreadsheet`
  );

  // Create page objects for each processed URL and add to cache
  processedUrls.forEach((url) => {
    // Create a simplified page object with the essential data
    const pageObject = {
      id: parseInt(url.pageId),
      slug: getSlugFromUrl(url.computedUrl),
      parent: 0, // Default parent ID (will be updated in hierarchy pass)
      link: url.wordpressUrl || url.computedUrl,
    };

    // Add to cache
    cachePage(pageObject);
    cacheCount++;
  });

  // Second pass: Set parent relationships based on URL hierarchy
  processedUrls.forEach((url) => {
    const pathSegments = url.computedUrl
      .replace(/^(?:https?:\/\/)?(?:www\.)?[^/]+\//, "")
      .split("/")
      .filter(Boolean);

    // Skip root level pages (they already have parent=0)
    if (pathSegments.length <= 1) return;

    // Get the slug and look for its parent
    const slug = pathSegments[pathSegments.length - 1];
    const parentSlug = pathSegments[pathSegments.length - 2];

    // Find the parent ID from our cache
    const potentialParentId = getPageFromCache(parentSlug, 0);
    if (potentialParentId) {
      // Update the page object in the cache with the correct parent
      const pageId = getPageFromCache(slug, 0);
      if (pageId) {
        // Update parent relationship in cache
        cachePage({
          id: pageId,
          slug: slug,
          parent: potentialParentId,
          link: url.wordpressUrl || url.computedUrl,
        });
      }
    }
  });

  console.log(`✅ Added ${cacheCount} pages to cache from spreadsheet data`);
}

/**
 * Extract the slug from a URL
 * @param {string} url - The URL to extract the slug from
 * @returns {string} - The extracted slug
 */
function getSlugFromUrl(url) {
  const pathSegments = url
    .replace(/^(?:https?:\/\/)?(?:www\.)?[^/]+\//, "")
    .split("/")
    .filter(Boolean);

  return pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : "";
}

module.exports = {
  syncCacheWithSpreadsheet,
};
