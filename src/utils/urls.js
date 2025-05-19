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

  // If this is a root page or empty path, always return true
  if (pathSegments.length <= 1 || !pathSegments[0]) {
    console.log(
      `🌱 Root-level page (${
        pathSegments[0] || "root"
      }), proceeding without parent check`
    );
    console.log(`🔍 HIERARCHY CHECK END ---------------------\n`);
    return true;
  }

  // For non-root pages, check parent hierarchy
  const parentPath = pathSegments.slice(0, -1).join("/");
  console.log(`👆 Checking immediate parent: ${parentPath}`);

  const parentId = await findPageBySlug(parentPath);
  if (!parentId) {
    // If parent is missing but is a root-level page, create it with dummy content
    if (pathSegments.length === 2) {
      console.log(`📝 Creating root-level parent page: ${parentPath}`);
      try {
        const parentTitle = parentPath.split("/").pop().replace(/-/g, " ");
        const dummyContent = `<!-- wp:paragraph --><p>Content for ${parentTitle}</p><!-- /wp:paragraph -->`;
        const { postToWordPress } = require("../postToWordpress");
        const newParentId = await postToWordPress({
          title: parentTitle.charAt(0).toUpperCase() + parentTitle.slice(1),
          content: dummyContent,
          status: "publish",
          slug: parentPath,
        });
        if (newParentId) {
          console.log(`✅ Created parent page with ID: ${newParentId}`);
          return true;
        }
      } catch (error) {
        console.error(`❌ Failed to create parent page: ${error.message}`);
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
