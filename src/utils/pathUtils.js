// Dependencies
const axios = require("axios");
const https = require("https");
const config = require("../config");
const { findPageBySlug } = require("../postToWordpress");

// Helper function to create an axios instance with proper auth and configuration
function createWpAxios(requiresAuth = true) {
  const instance = axios.create({
    baseURL: config.wordpress.apiEndpointUrl,
    headers: {
      "User-Agent": config.wordpress.userAgent,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    httpsAgent: new https.Agent({
      rejectUnauthorized: false,
    }),
    timeout: 10000,
  });

  // Add authentication if required
  if (requiresAuth && config.wordpress.username && config.wordpress.password) {
    const base64Credentials = Buffer.from(
      `${config.wordpress.username}:${config.wordpress.password}`
    ).toString("base64");

    instance.defaults.headers.common[
      "Authorization"
    ] = `Basic ${base64Credentials}`;
  }

  return instance;
}

// Create axios instances for authenticated and public requests
const wpAuthApi = createWpAxios(true);
const wpPublicApi = createWpAxios(false);

// Function to find a page by its complete path
async function findPageByExactPath(fullPath) {
  console.log(`\n[FIND PAGE BY EXACT PATH] -----------------`);
  console.log(`Looking for page with path: ${fullPath}`);

  try {
    // Normalize the path
    const normalizedPath = fullPath.replace(/^\/|\/$/g, "");
    const pathSegments = normalizedPath.split("/").filter(Boolean);

    // If path is empty, we're looking for the home page
    if (pathSegments.length === 0) {
      console.log(`Looking for home page`);
      const homePage = await findPageBySlug("home");
      return homePage;
    }

    // Get the slug (last part of the path)
    const finalSlug = pathSegments[pathSegments.length - 1];
    console.log(`Target slug: ${finalSlug}`);

    // Get all pages with this slug using Axios instead of WPAPI
    const response = await wpPublicApi.get(`/wp/v2/pages?slug=${finalSlug}`);
    const matchingPages = response.data;

    if (!matchingPages || matchingPages.length === 0) {
      console.log(`No pages found with slug: ${finalSlug}`);
      return null;
    }

    console.log(`Found ${matchingPages.length} pages with slug "${finalSlug}"`);

    // Filter out trashed pages first
    const nonTrashedPages = matchingPages.filter((page) => {
      try {
        const url = new URL(page.link);
        const pagePath = url.pathname.replace(/^\/|\/$/g, "");
        return !pagePath.includes("__trashed");
      } catch {
        return false;
      }
    });

    console.log(`${nonTrashedPages.length} non-trashed pages with this slug`);

    // Array to store matches with scoring
    const matches = [];

    // First, look for exact path matches among non-trashed pages
    for (const page of nonTrashedPages) {
      const pageLink = page.link;
      console.log(`Checking page ${page.id} with link: ${pageLink}`);

      try {
        const url = new URL(pageLink);
        const pagePath = url.pathname.replace(/^\/|\/$/g, "");
        console.log(`Extracted path: ${pagePath}`);

        // Compare with our target path
        if (pagePath === normalizedPath) {
          console.log(`✅ Found exact path match: Page ID ${page.id}`);
          return page.id; // Exact match found, return immediately
        }

        // Calculate a match score based on path segments
        const pagePathSegments = pagePath.split("/").filter(Boolean);
        let matchScore = 0;
        let allSegmentsMatch = true;

        // Check if segments match and count matching segments
        if (pagePathSegments.length === pathSegments.length) {
          for (let i = 0; i < pathSegments.length; i++) {
            if (pagePathSegments[i] === pathSegments[i]) {
              matchScore++;
            } else {
              allSegmentsMatch = false;
            }
          }

          // Record matches with their scores
          matches.push({
            id: page.id,
            score: matchScore,
            totalSegments: pathSegments.length,
            allSegmentsMatch,
            path: pagePath,
          });
        }
      } catch (e) {
        console.error(`Error parsing URL: ${e.message}`);
        continue;
      }
    }

    // If we found matches, find the best one
    if (matches.length > 0) {
      // Sort by: all segments match first, then by score
      matches.sort((a, b) => {
        if (a.allSegmentsMatch !== b.allSegmentsMatch) {
          return a.allSegmentsMatch ? -1 : 1;
        }
        return b.score - a.score;
      });

      const bestMatch = matches[0];

      // If all segments match, this is essentially an exact match
      if (bestMatch.allSegmentsMatch) {
        console.log(
          `✅ Found matching path: ${bestMatch.path} with ID ${bestMatch.id}`
        );
        return bestMatch.id;
      }

      // If we have a high match score (e.g., all but the last segment match), warn but return
      if (bestMatch.score >= pathSegments.length - 1) {
        console.log(
          `⚠️ Found close match: ${bestMatch.path} with ID ${bestMatch.id}`
        );
        console.log(
          `⚠️ Score: ${bestMatch.score}/${bestMatch.totalSegments} segments match`
        );
        console.log(
          `⚠️ This may be a hierarchical mismatch, check the path structure`
        );
        return null; // Return null to force creation in correct location
      }
    }

    // If we get here, no good match was found
    console.log(`❌ No matching page found for path: ${normalizedPath}`);
    return null;
  } catch (error) {
    console.error(`Error finding page by path: ${error.message}`);
    throw error;
  }
}

module.exports = {
  findPageByExactPath,
};
