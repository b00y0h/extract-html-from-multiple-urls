// Path mismatch detector and fixer
require("dotenv").config();
const WPAPI = require("wpapi");
const config = require("./src/config");

// Initialize WordPress API client
const wp = new WPAPI({
  endpoint: config.wordpress.apiBaseUrl,
  username: config.wordpress.username,
  password: config.wordpress.password,
});

// Specific test paths
const testPaths = [
  {
    correct:
      "/about/stories/cougar-quarterly/cougar-quarterly-winter-2025-alumni-spotlight",
    incorrect:
      "/about/publications/cougar-quarterly__trashed/cougar-quarterly-winter-2025-alumni-spotlight/",
  },
];

/**
 * Improved function to find a page by exact path
 */
async function findPageByExactPath(fullPath) {
  console.log(`\n[FIND PAGE BY EXACT PATH] -----------------`);
  console.log(`Looking for page at exactly: ${fullPath}`);

  // Normalize path
  const normalizedPath = fullPath.replace(/^\/|\/$/g, "");
  if (!normalizedPath) {
    console.log("Empty path provided");
    return null;
  }

  // Get path segments
  const pathSegments = normalizedPath.split("/").filter(Boolean);
  const finalSlug = pathSegments[pathSegments.length - 1];

  console.log(`Path segments: ${JSON.stringify(pathSegments)}`);
  console.log(`Looking for final slug: ${finalSlug}`);

  try {
    // Get all pages with the target slug
    const pagesWithSlug = await wp.pages().slug(finalSlug);
    console.log(
      `Found ${pagesWithSlug?.length || 0} pages with slug "${finalSlug}"`
    );

    if (!pagesWithSlug || pagesWithSlug.length === 0) {
      console.log(`No pages found with slug "${finalSlug}"`);
      return null;
    }

    // Build a report table of all matching pages
    console.log("\nAll pages with this slug:");
    console.log("--------------------------------------------");
    console.log("ID\t| Parent ID\t| Path\t\t\t| Trashed?");
    console.log("--------------------------------------------");

    // Check each matching page for exact path
    const matches = [];
    for (const page of pagesWithSlug) {
      const pageLink = page.link;
      let pagePath = "";
      let isTrashed = false;

      try {
        const url = new URL(pageLink);
        pagePath = url.pathname.replace(/^\/|\/$/g, "");
        isTrashed = pagePath.includes("__trashed");

        console.log(
          `${page.id}\t| ${page.parent}\t| ${pagePath}\t| ${
            isTrashed ? "YES" : "NO"
          }`
        );

        // Strict path comparison
        if (pagePath === normalizedPath) {
          matches.push({
            id: page.id,
            path: pagePath,
            isTrashed,
            exact: true,
            parent: page.parent,
            title: page.title.rendered,
          });
        }
        // Check if all segments match (ignoring __trashed)
        else {
          const pagePathSegments = pagePath
            .split("/")
            .filter(Boolean)
            .map((segment) => segment.replace(/__trashed$/, ""));

          // Check if all path segments match (excluding __trashed marker)
          let allSegmentsMatch = true;
          if (pagePathSegments.length === pathSegments.length) {
            for (let i = 0; i < pathSegments.length; i++) {
              if (
                pagePathSegments[i].replace(/__trashed$/, "") !==
                pathSegments[i]
              ) {
                allSegmentsMatch = false;
                break;
              }
            }

            if (allSegmentsMatch) {
              matches.push({
                id: page.id,
                path: pagePath,
                isTrashed,
                exact: false,
                parent: page.parent,
                title: page.title.rendered,
              });
            }
          }
        }
      } catch (e) {
        console.error(`Error parsing URL: ${e.message}`);
        continue;
      }
    }

    // Print matches
    console.log("\nMatching pages:");
    if (matches.length === 0) {
      console.log("No exact or similar matches found");
      return null;
    }

    // Sort matches (non-trashed before trashed, exact before similar)
    matches.sort((a, b) => {
      if (a.isTrashed !== b.isTrashed) return a.isTrashed ? 1 : -1;
      if (a.exact !== b.exact) return a.exact ? -1 : 1;
      return 0;
    });

    console.log(JSON.stringify(matches, null, 2));

    // Return the best match (first in sorted array)
    console.log(
      `\nBest match: Page ID ${matches[0].id}, path: ${matches[0].path}`
    );
    console.log(`Title: ${matches[0].title}`);
    console.log(`Is trashed: ${matches[0].isTrashed}`);
    console.log(`Is exact match: ${matches[0].exact}`);

    return matches[0].id;
  } catch (error) {
    console.error(`Error finding page: ${error.message}`);
    return null;
  }
}

/**
 * Function to test page lookups for specific paths
 */
async function testPathLookups() {
  console.log("Testing path lookups...\n");

  for (const testPath of testPaths) {
    console.log(`\n==================================================`);
    console.log(`Testing path pair:`);
    console.log(`Correct: ${testPath.correct}`);
    console.log(`Incorrect: ${testPath.incorrect}`);
    console.log(`==================================================\n`);

    // Test with correct path
    console.log("LOOKING UP CORRECT PATH:");
    const correctResult = await findPageByExactPath(testPath.correct);
    console.log(
      `Result for correct path: ${correctResult ? correctResult : "Not found"}`
    );

    // Test with incorrect path
    console.log("\nLOOKING UP INCORRECT PATH:");
    const incorrectResult = await findPageByExactPath(testPath.incorrect);
    console.log(
      `Result for incorrect path: ${
        incorrectResult ? incorrectResult : "Not found"
      }`
    );
  }
}

// Run the tests
testPathLookups();
