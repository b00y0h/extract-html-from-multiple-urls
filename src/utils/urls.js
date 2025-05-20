const path = require("path");
const fs = require("fs");
const config = require("../config");
const { findPageBySlug } = require("../postToWordpress");

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

  const sortedUrls = urls.sort((a, b) => {
    const getDepth = (url) => {
      const path = url.replace(
        new RegExp(`^(?:https?:\/\/)?(?:www\.)?${domain}\/`),
        ""
      );
      const segments = path.split("/").filter(Boolean);
      // Return -1 for empty paths to ensure they're processed first
      return segments.length === 0 ? -1 : segments.length;
    };

    const depthA = getDepth(a.computedUrl);
    const depthB = getDepth(b.computedUrl);

    // Sort by depth first
    if (depthA !== depthB) {
      return depthA - depthB;
    }

    // For same depth, sort alphabetically to ensure consistent order
    return a.computedUrl.localeCompare(b.computedUrl);
  });

  console.log("\n📋 Planned Processing Order:");
  sortedUrls.forEach((url, index) => {
    const depth = url.computedUrl.split("/").filter(Boolean).length;
    console.log(`  ${index + 1}. [Depth: ${depth}] ${url.computedUrl}`);
  });

  return sortedUrls;
}

// Add this function to verify parent exists before processing
async function verifyParentHierarchy(url) {
  const pathSegments = url
    .replace(/^(?:https?:\/\/)?(?:www\.)?[^/]+\//, "") // Remove domain part
    .split("/")
    .filter(Boolean);

  console.log(`\n🔍 HIERARCHY CHECK START ---------------------`);
  console.log(`📍 Checking hierarchy for: ${url}`);
  console.log(`📚 Path segments:`, pathSegments);
  console.log(`📏 Segment count: ${pathSegments.length}`);

  // For an empty path or root URL, verify it doesn't already exist
  if (pathSegments.length === 0) {
    console.log(`🌱 Home page request, checking if it exists...`);
    const homePageId = await findPageBySlug("");
    if (homePageId) {
      console.log(`⚠️ Home page already exists with ID: ${homePageId}`);
      return false;
    }
    return true;
  }

  // For root-level pages, check if they already exist
  if (pathSegments.length === 1) {
    console.log(`🌱 Root-level page check: ${pathSegments[0]}`);
    const pageId = await findPageBySlug(pathSegments[0]);
    if (pageId) {
      console.log(`⚠️ Page already exists with ID: ${pageId}`);
      return false;
    }
    console.log(`✅ Root-level page can be created`);
    return true;
  }

  // For nested pages, check the entire hierarchy
  console.log(`👆 Checking full hierarchy for: ${pathSegments.join("/")}`);

  // Check if this exact page already exists
  const existingPageId = await findPageBySlug(pathSegments.join("/"));
  if (existingPageId) {
    console.log(`⚠️ Page already exists with ID: ${existingPageId}`);
    return false;
  }

  // Check if parent exists
  const parentPath = pathSegments.slice(0, -1).join("/");
  const parentId = await findPageBySlug(parentPath);

  if (!parentId) {
    if (pathSegments.length === 2) {
      // Only auto-create parent if it's a root-level parent
      console.log(`📝 Need to create root-level parent: ${parentPath}`);
      try {
        const parentTitle = pathSegments[0].replace(/-/g, " ");
        const dummyContent = `<!-- wp:paragraph --><p>Parent page for ${parentTitle}</p><!-- /wp:paragraph -->`;
        const { postToWordPress } = require("../postToWordpress");
        const newParentId = await postToWordPress({
          title: parentTitle.charAt(0).toUpperCase() + parentTitle.slice(1),
          content: dummyContent,
          status: "publish",
          slug: parentPath,
        });
        if (newParentId) {
          console.log(
            `✅ Created root-level parent page with ID: ${newParentId}`
          );
          return true;
        }
      } catch (error) {
        console.error(`❌ Failed to create parent page: ${error.message}`);
        return false;
      }
    }
    console.log(`❌ Parent not found: ${parentPath}`);
    console.log(`🔍 HIERARCHY CHECK END ---------------------\n`);
    return false;
  }

  console.log(`✅ Parent exists with ID: ${parentId}`);
  console.log(`🔍 HIERARCHY CHECK END ---------------------\n`);
  return true;
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
};
