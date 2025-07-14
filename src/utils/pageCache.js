/**
 * Page cache utility to minimize WordPress API calls
 *
 * This module provides caching for WordPress page hierarchy information
 * to avoid repetitive API calls when checking the same pages.
 */

// Cache structure:
// {
//   bySlugAndParent: { 'slug:parentId': pageId },
//   byId: { pageId: { id, slug, parent, link } }
// }
const pageCache = {
  bySlugAndParent: {},
  byId: {},
};

/**
 * Store a page in the cache
 * @param {Object} page - The page object from WordPress
 */
function cachePage(page) {
  if (!page || !page.id) return;

  // Cache by slug and parent
  const cacheKey = `${page.slug}:${page.parent || 0}`;
  pageCache.bySlugAndParent[cacheKey] = page.id;

  // Cache page details by ID
  pageCache.byId[page.id] = {
    id: page.id,
    slug: page.slug,
    parent: page.parent,
    link: page.link,
  };
}

/**
 * Store multiple pages in the cache
 * @param {Array} pages - Array of page objects from WordPress
 */
function cachePages(pages) {
  if (!pages || !Array.isArray(pages)) return;

  pages.forEach((page) => cachePage(page));
}

/**
 * Get a page from the cache by slug and parent ID
 * @param {string} slug - The page slug
 * @param {number} parentId - The parent page ID
 * @returns {number|null} - The page ID if found, null otherwise
 */
function getPageFromCache(slug, parentId = 0) {
  const cacheKey = `${slug}:${parentId}`;
  return pageCache.bySlugAndParent[cacheKey] || null;
}

/**
 * Get page details from the cache by ID
 * @param {number} pageId - The page ID
 * @returns {Object|null} - The page details if found, null otherwise
 */
function getPageDetailsFromCache(pageId) {
  return pageCache.byId[pageId] || null;
}

/**
 * Get a parent hierarchy path from the cache
 * @param {number} pageId - The page ID to start from
 * @returns {string|null} - The full path if all ancestors are in cache, null otherwise
 */
function getPathFromCache(pageId) {
  const segments = [];
  let currentId = pageId;

  while (currentId && currentId !== 0) {
    const pageDetails = getPageDetailsFromCache(currentId);
    if (!pageDetails) return null; // Break if any ancestor is not in cache

    segments.unshift(pageDetails.slug);
    currentId = pageDetails.parent;
  }

  return segments.join("/");
}

/**
 * Clear the entire cache
 */
function clearCache() {
  pageCache.bySlugAndParent = {};
  pageCache.byId = {};
}

module.exports = {
  cachePage,
  cachePages,
  getPageFromCache,
  getPageDetailsFromCache,
  getPathFromCache,
  clearCache,
};
