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
    __dirname,
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

// Transform a production URL to its staging equivalent
function transformToStagingUrl(url) {
  const parsedUrl = new URL(url);
  // Remove any existing path from production URL
  const cleanPath = parsedUrl.pathname.replace(/^\//, "").replace(/\/$/, "");
  // Construct the new staging URL
  return `https://${config.urls.staging}/${cleanPath}/`;
}

// Function to sort URLs by hierarchy depth
function sortUrlsByHierarchy(urls) {
  const sortedUrls = urls.sort((a, b) => {
    const getDepth = (url) => {
      const path = url.replace(
        /^(?:https?:\/\/)?(?:www\.)?vancouver\.wsu\.edu\//,
        ""
      );
      return (path.match(/\//g) || []).length;
    };
    return getDepth(a.computedUrl) - getDepth(b.computedUrl);
  });

  console.log("\n📋 Planned Processing Order:");
  sortedUrls.forEach((url, index) => {
    const depth = url.computedUrl.split("/").filter(Boolean).length - 1;
    console.log(`${index + 1}. ${"  ".repeat(depth)}${url.computedUrl}`);
  });
  console.log("\n");

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

  // If this is a root page, no verification needed
  if (pathSegments.length <= 1) {
    console.log(`🌱 Root-level page, no parent check needed`);
    console.log(`🔍 HIERARCHY CHECK END ---------------------\n`);
    return true;
  }

  // Only check up to the immediate parent
  const parentPath = pathSegments.slice(0, -1).join("/");
  console.log(`👆 Checking immediate parent: ${parentPath}`);

  const parentId = await findPageBySlug(parentPath);
  if (!parentId) {
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
};
