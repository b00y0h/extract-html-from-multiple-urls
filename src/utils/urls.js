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

  console.log("\n📂 CHILD PAGES:");
  childPages.forEach((url, index) => {
    const depth = url.depth;
    console.log(
      `  ${index + 1}. [Depth: ${depth}] ${"  ".repeat(depth)}${
        url.computedUrl
      }`
    );
  });
  console.log("");

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

  // Check if this exact page already exists
  const fullPath = pathSegments.join("/");
  const existingPageId = await findPageBySlug(fullPath);
  if (existingPageId) {
    console.log(`⚠️ Page already exists with ID: ${existingPageId}`);
    return false;
  }

  // For nested pages, verify the parent hierarchy exists
  const { postToWordPress } = require("../postToWordpress");

  // Check each level of the hierarchy
  let parentPages = new Map(); // Keep track of found parent pages

  for (let i = 1; i < pathSegments.length; i++) {
    const parentPath = pathSegments.slice(0, i).join("/");
    console.log(`👆 Checking parent: ${parentPath}`);

    const parentId = await findPageBySlug(parentPath);
    if (parentId) {
      console.log(`✅ Parent exists: ${parentPath} with ID: ${parentId}`);
      parentPages.set(parentPath, parentId);
      continue; // Skip to next parent check since this one exists
    }

    // Only create parent if we don't already have it
    if (!parentPages.has(parentPath)) {
      console.log(`📝 Creating missing parent: ${parentPath}`);
      try {
        const parentSlug = pathSegments[i - 1];
        const parentTitle = parentSlug.replace(/-/g, " ");
        const dummyContent = `<!-- wp:paragraph --><p>Parent page for ${parentTitle}</p><!-- /wp:paragraph -->`;
        const newParentId = await postToWordPress({
          title: parentTitle.charAt(0).toUpperCase() + parentTitle.slice(1),
          content: dummyContent,
          status: "publish",
          slug: parentPath,
        });

        if (!newParentId) {
          console.error(`❌ Failed to create parent page: ${parentPath}`);
          console.log(`🔍 HIERARCHY CHECK END ---------------------\n`);
          return false;
        }
        console.log(
          `✅ Created parent page: ${parentPath} with ID: ${newParentId}`
        );
        parentPages.set(parentPath, newParentId);

        // Add a small delay to ensure WordPress processes the new page
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(
          `❌ Error creating parent page ${parentPath}:`,
          error.message
        );
        console.log(`🔍 HIERARCHY CHECK END ---------------------\n`);
        return false;
      }
    }
  }

  console.log(`✅ Full hierarchy verified/created successfully`);
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
