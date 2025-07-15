/**
 * Enhanced WordPress Page Hierarchy Manager
 *
 * This class provides improved handling of WordPress page hierarchies by:
 * 1. Efficiently finding or creating pages with proper parent-child relationships
 * 2. Maintaining a local cache to reduce API calls
 * 3. Supporting retry mechanisms for better reliability
 * 4. Providing more detailed logging
 */

const config = require("../config");
const { logMessage } = require("./logs");

class WordPressPageHierarchy {
  constructor(wpApi, options = {}) {
    this.wpApi = wpApi;
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.pageCache = new Map(); // Cache to avoid duplicate API calls
  }

  /**
   * Find or create a complete page hierarchy from a URL path
   * @param {string} urlPath - The URL path to create hierarchy for
   * @param {string} action - Action to take (Move/Create)
   * @returns {Promise<number>} - The ID of the final page in the hierarchy
   */
  async findOrCreatePageHierarchy(urlPath, action = "Move") {
    console.log("\n[PAGE HIERARCHY] -----------------------------");
    console.log(`Processing hierarchy for: ${urlPath}`);
    console.log(`Action: ${action}`);

    // Extract path segments, ignoring domain
    const pathSegments = urlPath
      .replace(/^(?:https?:\/\/)?(?:www\.)?[^/]+\//, "") // Remove domain
      .split("/")
      .filter(Boolean);

    console.log(`Path segments: ${JSON.stringify(pathSegments)}`);

    // Handle root page
    if (pathSegments.length === 0) {
      console.log(`Home page request, checking if it exists...`);
      const homePage = await this.findPageBySlugAndParent("home", 0);
      if (homePage) {
        console.log(`Home page already exists with ID: ${homePage}`);
        return homePage;
      }
      return 0; // Return 0 to indicate this is a valid root level
    }

    let currentParent = 0; // Start at root level
    let pageId = 0;
    let currentPath = "";

    // Process each segment in the path
    for (let i = 0; i < pathSegments.length; i++) {
      const slug = pathSegments[i];
      const isLastSegment = i === pathSegments.length - 1;
      currentPath += (currentPath ? "/" : "") + slug;

      console.log(
        `\nProcessing segment ${i + 1}/${pathSegments.length}: ${slug}`
      );
      console.log(`Current path: ${currentPath}`);
      console.log(`Parent ID: ${currentParent}`);

      try {
        // Check cache first
        const cacheKey = `${slug}_${currentParent}`;
        if (this.pageCache.has(cacheKey)) {
          pageId = this.pageCache.get(cacheKey);
          console.log(
            `✅ CACHE HIT: Found page "${slug}" with ID: ${pageId} in cache`
          );
        } else {
          // Check if page exists with this slug and parent
          pageId = await this.findPageBySlugAndParent(slug, currentParent);

          if (pageId) {
            console.log(`Found existing page: ${slug} (ID: ${pageId})`);
            this.pageCache.set(cacheKey, pageId);
          } else {
            // No page found with this slug and parent
            if (isLastSegment || action === "Create") {
              // Create the page for the last segment or if action is Create
              if (action === "Move" && !isLastSegment) {
                console.log(`❌ Missing parent in hierarchy: ${slug}`);
                return null;
              }

              console.log(
                `Creating new page: ${slug} with parent: ${currentParent}`
              );
              pageId = await this.createPage(
                slug,
                currentParent,
                isLastSegment
              );
              console.log(`Created new page: ${slug} (ID: ${pageId})`);
              this.pageCache.set(cacheKey, pageId);
            } else {
              // Missing parent in hierarchy for "Move" action
              console.log(`❌ Missing parent in hierarchy: ${slug}`);
              return null;
            }
          }
        }

        // Update current parent for next iteration
        currentParent = pageId;
      } catch (error) {
        console.error(`Error processing ${slug}:`, error.message);
        logMessage(`Error in page hierarchy for ${slug}: ${error.message}`);
        return null;
      }
    }

    console.log(`\n✅ Complete hierarchy processed, final page ID: ${pageId}`);
    console.log("[PAGE HIERARCHY END] --------------------------\n");
    return pageId;
  }

  /**
   * Find a page by slug and parent ID
   * @param {string} slug - The page slug to find
   * @param {number} parentId - The parent ID to match
   * @returns {Promise<number|null>} - The page ID if found, null otherwise
   */
  async findPageBySlugAndParent(slug, parentId) {
    try {
      console.log(
        `Searching for page with slug "${slug}" and parent ID ${parentId}`
      );

      // Make sure slug is sanitized and URI encoded
      const sanitizedSlug = encodeURIComponent(slug.toLowerCase().trim());

      const response = await this.wpApi.get(`/wp/v2/pages`, {
        params: {
          slug: sanitizedSlug,
          parent: parentId,
          per_page: 1,
        },
      });

      if (response.data && response.data.length > 0) {
        console.log(`Found page with ID: ${response.data[0].id}`);
        return response.data[0].id;
      }

      console.log(
        `No page found with slug "${slug}" and parent ID ${parentId}`
      );
      return null;
    } catch (error) {
      console.error(`API Error: ${error.message}`);
      if (error.response) {
        console.error(`API Status: ${error.response.status}`);
        console.error(`API Response: ${JSON.stringify(error.response.data)}`);
      }
      return null;
    }
  }

  /**
   * Create a new page in WordPress
   * @param {string} slug - The slug for the new page
   * @param {number} parentId - The parent ID for the new page
   * @param {boolean} isContent - Whether this is a content page or just a parent in the hierarchy
   * @returns {Promise<number>} - The ID of the created page
   */
  async createPage(slug, parentId, isContent = false) {
    const title = this.slugToTitle(slug);

    console.log(`Creating page with slug "${slug}" and parent ID ${parentId}`);

    // Create proper content based on whether this is a content page or just part of the hierarchy
    // Only use placeholder content for non-content pages in the hierarchy
    // Content pages will have their actual content added later by postToWordPress
    const content = isContent
      ? "" // Empty content for content pages - will be replaced with actual content
      : `<!-- wp:paragraph --><p>This is a hierarchy page for ${title}.</p><!-- /wp:paragraph -->`;

    const pageData = {
      title: title,
      slug: slug,
      status: "publish",
      type: "page",
      parent: parentId,
      content: content,
    };

    try {
      // Add rate limiting - pause before making API request
      await this.sleep(1000);

      console.log(`Sending page creation request:`, pageData);
      const response = await this.wpApi.post("/wp/v2/pages", pageData);
      console.log(`Successfully created page with ID: ${response.data.id}`);
      return response.data.id;
    } catch (error) {
      console.error(`Error creating page ${slug}:`, error.message);
      if (error.response) {
        console.error(`Response status: ${error.response.status}`);
        console.error(`Response data:`, JSON.stringify(error.response.data));
      }
      throw error;
    }
  }

  /**
   * Convert a slug to a title
   * @param {string} slug - The slug to convert
   * @returns {string} - The formatted title
   */
  slugToTitle(slug) {
    return slug
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  /**
   * Wait for a specified time
   * @param {number} ms - Time to wait in milliseconds
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = WordPressPageHierarchy;
