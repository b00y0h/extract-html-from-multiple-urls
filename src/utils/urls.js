const path = require("path");
const fs = require("fs");
const config = require("../config");
const { findPageBySlug } = require("../postToWordpress");
const WordPressPageHierarchy = require("./wordPressPageHierarchy");
const { wpApi } = require("../apiClients");
const { getPageFromCache } = require("./pageCache");

// Extract the root URL (protocol and host) from a given URL
function getRootUrl(url) {
  try {
    url = ensureUrlProtocol(url);
    const parsedUrl = new URL(url);
    return `${parsedUrl.protocol}//${parsedUrl.host}`;
  } catch (error) {
    console.error("Invalid URL:", error, "Input URL:", url);
    return null;
  }
}

function ensureUrlProtocol(url) {
  if (!url || typeof url !== "string" || url.trim() === "") {
    throw new Error("Empty or invalid URL provided");
  }

  if (!/^https?:\/\//i.test(url)) {
    return `https://${url}`;
  }
  return url;
}

// Create directories based on the original URL path
function createDirectoriesFromUrl(url) {
  const parsedUrl = new URL(url);
  const domainFolder = parsedUrl.hostname;
  const directoryPath = path.join(
    process.cwd(),
    "dist",
    domainFolder,
    parsedUrl.pathname
  );
  fs.mkdirSync(directoryPath, { recursive: true });
  return directoryPath;
}

// Sanitize the file name by removing unwanted characters
function sanitizeFileName(url) {
  return url.replace(/^https?:\/\//, "").replace(/[^\w.-]+/g, "_");
}

// Transform URLs for different environments
function transformUrl(url, environment = process.env.NODE_ENV) {
  // Clean the path - remove leading/trailing slashes
  const cleanPath = url.startsWith("http")
    ? new URL(url).pathname.replace(/^\/|\/$/g, "")
    : url.replace(/^\/|\/$/g, "");

  // Get the appropriate domain based on environment
  const domain =
    environment === "production" ? config.urls.production : config.urls.staging;

  if (!domain) {
    throw new Error(`Domain not configured for environment: ${environment}`);
  }

  // Special handling for home page
  if (cleanPath === "home" || cleanPath === "") {
    return `https://${domain}`;
  }

  return `https://${domain}/${cleanPath}`;
}

// Maintain backward compatibility
function transformToStagingUrl(url) {
  return transformUrl(url, "staging");
}

// Function to sort URLs by hierarchy depth
function sortUrlsByHierarchy(urls) {
  const domain =
    process.env.NODE_ENV === "production"
      ? config.urls.production
      : config.urls.staging;

  // Helper function to get path segments and depth
  const getPathInfo = (url) => {
    const urlString = typeof url === "string" ? url : url.computedUrl;
    const path = urlString.replace(
      new RegExp(`^(?:https?:\/\/)?(?:www\.)?${domain}\/`),
      ""
    );
    const segments = path.split("/").filter(Boolean);
    return {
      segments,
      depth: segments.length,
    };
  };

  // Group URLs by their hierarchy level
  const urlsByLevel = {};
  let maxLevel = 0;

  urls.forEach((url) => {
    const pathInfo = getPathInfo(url.computedUrl);
    const level = pathInfo.depth;

    // Initialize array for this level if it doesn't exist
    if (!urlsByLevel[level]) {
      urlsByLevel[level] = [];
    }

    // Add URL to its level group
    urlsByLevel[level].push({
      ...url,
      depth: level,
      segments: pathInfo.segments,
    });

    // Keep track of the deepest level
    if (level > maxLevel) {
      maxLevel = level;
    }
  });

  // Sort URLs within each level for better organization
  Object.keys(urlsByLevel).forEach((level) => {
    urlsByLevel[level].sort((a, b) => {
      // If priority is defined, prioritize first
      if (a.processFirst !== b.processFirst) {
        return a.processFirst ? -1 : 1;
      }

      // Then sort by path structure to ensure parent-child relationships are respected
      if (a.segments.length > 0 && b.segments.length > 0) {
        // Compare the first segment (top-level path) first
        const firstSegmentComparison = a.segments[0].localeCompare(
          b.segments[0]
        );
        if (firstSegmentComparison !== 0) {
          return firstSegmentComparison;
        }
      }

      // If first segments are the same, sort alphabetically
      return a.computedUrl.localeCompare(b.computedUrl);
    });
  });

  // For logging and visualization only, we return all URLs grouped by level
  const sortedUrls = [];
  for (let level = 0; level <= maxLevel; level++) {
    if (urlsByLevel[level]) {
      sortedUrls.push(...urlsByLevel[level]);
    }
  }

  // Log the processing order for better visibility
  console.log("\n📋 Planned Processing Order by Hierarchy Level:");
  for (let level = 0; level <= maxLevel; level++) {
    if (urlsByLevel[level] && urlsByLevel[level].length > 0) {
      console.log(
        `\n🌳 LEVEL ${level} PAGES (${urlsByLevel[level].length} pages):`
      );
      urlsByLevel[level].forEach((url, index) => {
        const priority = url.processFirst ? "🔥 [PRIORITY]" : "";
        console.log(`  ${index + 1}. ${priority} ${url.computedUrl}`);
      });
    }
  }

  // Return a map of URLs by level to make it easier for the main processing function
  return {
    sortedUrls, // All URLs sorted hierarchically (for backwards compatibility)
    urlsByLevel, // URLs grouped by level for level-by-level processing
    maxLevel, // The maximum depth level found
  };
}

// Add this function to verify parent exists before processing
async function verifyParentHierarchy(url, action = "Move") {
  console.log("\n[HIERARCHY CHECK] ---------------------");
  console.log(`Checking hierarchy for: ${url}`);
  console.log(`Action: ${action}`);

  // Use the new WordPressPageHierarchy class
  const pageHierarchy = new WordPressPageHierarchy(wpApi, {
    maxRetries: 3,
    retryDelay: 1000,
  });

  const parentId = await pageHierarchy.findOrCreatePageHierarchy(url, action);

  console.log(
    `Hierarchy check result: ${parentId !== null ? "Success" : "Failed"}`
  );
  if (parentId !== null) {
    console.log(`Parent ID: ${parentId}`);
  }

  return parentId;
}

// Helper function to create a missing level in the hierarchy
async function createHierarchyLevel(slug, parentId) {
  console.log(
    `Creating missing hierarchy level: ${slug} with parent: ${parentId}`
  );

  const { postToWordPress, getParentPagePath } = require("../postToWordpress");

  // Create a placeholder page for this hierarchy level
  const title = slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");
  const placeholderContent = `<!-- wp:paragraph --><p>This is a placeholder page for ${title}.</p><!-- /wp:paragraph -->`;

  // Construct a URL path for this level by getting the full parent path
  let urlPath = slug;
  if (parentId > 0) {
    // Get the full parent path to ensure correct hierarchy
    const parentPath = await getParentPagePath(parentId);
    urlPath = parentPath ? `${parentPath}/${slug}` : slug;
    console.log(`Constructed full URL path: ${urlPath}`);
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

module.exports = {
  getRootUrl,
  ensureUrlProtocol,
  createDirectoriesFromUrl,
  sanitizeFileName,
  sortUrlsByHierarchy,
  verifyParentHierarchy,
  transformToStagingUrl,
  transformUrl,
  createHierarchyLevel,
};
