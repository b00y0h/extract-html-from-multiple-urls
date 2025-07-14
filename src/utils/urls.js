const path = require("path");
const fs = require("fs");
const config = require("../config");
const { findPageBySlug } = require("../postToWordpress");
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
    const path = url.replace(
      new RegExp(`^(?:https?:\/\/)?(?:www\.)?${domain}\/`),
      ""
    );
    const segments = path.split("/").filter(Boolean);
    return {
      segments,
      depth: segments.length,
      isRoot: segments.length <= 1,
    };
  };

  // First, separate root and child pages
  const rootPages = [];
  const childPages = [];

  urls.forEach((url) => {
    const pathInfo = getPathInfo(url.computedUrl);
    if (pathInfo.isRoot) {
      rootPages.push({ ...url, depth: pathInfo.depth });
    } else {
      childPages.push({ ...url, depth: pathInfo.depth });
    }
  });

  // Sort root pages alphabetically
  rootPages.sort((a, b) => a.computedUrl.localeCompare(b.computedUrl));

  // Sort child pages by depth and then alphabetically
  childPages.sort((a, b) => {
    if (a.depth !== b.depth) {
      return a.depth - b.depth;
    }
    return a.computedUrl.localeCompare(b.computedUrl);
  });

  // Combine root pages first, then child pages
  const sortedUrls = [...rootPages, ...childPages];

  console.log("\n📋 Planned Processing Order:");
  console.log("🌳 ROOT PAGES:");
  rootPages.forEach((url, index) => {
    console.log(`  ${index + 1}. [Root] ${url.computedUrl}`);
  });

  return sortedUrls;
}

// Add this function to verify parent exists before processing
async function verifyParentHierarchy(url, action = "Move") {
  const pathSegments = url
    .replace(/^(?:https?:\/\/)?(?:www\.)?[^/]+\//, "") // Remove domain part
    .split("/")
    .filter(Boolean);

  console.log("\n[HIERARCHY CHECK] ---------------------");
  console.log(`Checking hierarchy for: ${url}`);
  console.log(`Path segments:`, pathSegments);
  console.log(`Segment count: ${pathSegments.length}`);
  console.log(`Action: ${action}`);

  // For an empty path or root URL, verify it doesn't already exist
  if (pathSegments.length === 0) {
    console.log(`Home page request, checking if it exists...`);
    const existingPage = await findPageBySlug("home");
    if (existingPage) {
      console.log(`Home page already exists with ID: ${existingPage}`);
      return existingPage;
    }
    return 0; // Return 0 to indicate this is a valid root page (home)
  }

  // For root-level pages, check if they already exist
  if (pathSegments.length === 1) {
    const slug = pathSegments[0];
    console.log(`Root page request for slug: ${slug}`);
    const existingPage = await findPageBySlug(slug);
    if (existingPage) {
      console.log(`Root page already exists with ID: ${existingPage}`);
      return existingPage;
    }
    return 0; // Return 0 to indicate this is a valid root page
  }

  // For child pages, verify the entire path hierarchy exists
  // We need to validate each level of the hierarchy
  let currentHierarchyPath = "";
  let parentId = 0; // 0 means root level

  // Check each level in the hierarchy except the last one (which is the page we're creating)
  for (let i = 0; i < pathSegments.length - 1; i++) {
    const currentSlug = pathSegments[i];
    currentHierarchyPath += (currentHierarchyPath ? "/" : "") + currentSlug;

    console.log(`Checking hierarchy level ${i + 1}: ${currentSlug}`);
    console.log(`Full path so far: ${currentHierarchyPath}`);

    // Try to find the page at this level with specific parent
    let pageId = await findPageBySlug(currentSlug, parentId);

    // If not found with specific parent, try to find any page with this slug (could be at root)
    if (!pageId) {
      console.log(
        `No page found with slug "${currentSlug}" and parent ID ${parentId}. Trying to find any page with this slug...`
      );
      pageId = await findPageBySlug(currentSlug);

      if (pageId) {
        console.log(
          `Found page "${currentSlug}" with ID: ${pageId} (but different parent)`
        );
        // When a page is found but with a different parent, it's still a valid page
        // This handles cases where parent pages were created at the root level
      }
    }

    // If still not found and we're creating pages, create it
    if (!pageId) {
      // If we're creating pages and a level doesn't exist, that's okay
      if (action === "Create") {
        console.log(
          `Page "${currentSlug}" at level ${
            i + 1
          } doesn't exist but will be created since action is Create`
        );
        // Create this level
        const createdPageId = await createHierarchyLevel(currentSlug, parentId);
        parentId = createdPageId;
      } else {
        // For Move action, we need the entire hierarchy to exist
        console.log(
          `❌ Parent hierarchy incomplete: missing level ${
            i + 1
          } "${currentSlug}"`
        );
        return null;
      }
    } else {
      console.log(`Found page "${currentSlug}" with ID: ${pageId}`);
      parentId = pageId;
    }
  }

  // Return the ID of the immediate parent (the last level we checked)
  console.log(`Full hierarchy verified. Immediate parent ID: ${parentId}`);
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
