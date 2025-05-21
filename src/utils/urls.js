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

  // For child pages, verify the parent exists or can be created
  const parentSlug = pathSegments[pathSegments.length - 2];
  console.log(`Checking for parent page with slug: ${parentSlug}`);

  const parentPage = await findPageBySlug(parentSlug);
  if (!parentPage) {
    // If we're creating pages and the parent doesn't exist, that's okay
    if (action === "Create") {
      console.log(
        `Parent page "${parentSlug}" doesn't exist but will be created since action is Create`
      );
      return 0;
    }
    // For Move action, we need the parent to exist
    throw new Error(
      `Parent page with slug "${parentSlug}" not found. Cannot create child page.`
    );
  }

  console.log(`Found parent page with ID: ${parentPage}`);
  return parentPage;
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
