#!/usr/bin/env node

/**
 * WordPress Content Deletion Script
 *
 * This script deletes all pages and media from a WordPress site.
 * USE WITH CAUTION: This will permanently delete content.
 *
 * Usage: node deleteWordPressContent.js [--types=pages,media] [--dry-run] [--batch-size=20]
 * Options:
 *   --types: Comma-separated list of content types to delete (default: pages,media)
 *   --dry-run: Show what would be deleted without actually deleting
 *   --batch-size: Number of items to delete in a single batch (default: 10)
 */

const axios = require("axios");
const https = require("https");
const config = require("./src/config");
const fs = require("fs");
const path = require("path");

// Parse command-line arguments
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const typesArg = args.find((arg) => arg.startsWith("--types="));
const batchSizeArg = args.find((arg) => arg.startsWith("--batch-size="));
const batchSize = batchSizeArg
  ? parseInt(batchSizeArg.replace("--batch-size=", ""), 10)
  : 10;
const contentTypes = typesArg
  ? typesArg.replace("--types=", "").split(",")
  : ["pages", "media"];

// Helper function to create an axios instance with proper auth and configuration
function createWpAxios() {
  const instance = axios.create({
    baseURL: config.wordpress.apiEndpointUrl,
    headers: {
      "User-Agent": config.wordpress.userAgent || "WordPress API Client",
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    httpsAgent: new https.Agent({
      rejectUnauthorized: false,
    }),
    timeout: 30000,
  });

  // Add authentication
  if (config.wordpress.username && config.wordpress.password) {
    const base64Credentials = Buffer.from(
      `${config.wordpress.username}:${config.wordpress.password}`
    ).toString("base64");

    instance.defaults.headers.common[
      "Authorization"
    ] = `Basic ${base64Credentials}`;
  }

  return instance;
}

// Create axios instance for API requests
const wpApi = createWpAxios();

// Initialize WordPress API
console.log("Connecting to WordPress API...");
console.log("API Endpoint:", config.wordpress.apiEndpointUrl);
console.log("Username:", config.wordpress.username);
console.log("Password is defined:", !!config.wordpress.password);

// Print warning and confirmation
console.log(
  "⚠️  WARNING: This script will delete WordPress content permanently ⚠️"
);
console.log(`Target WordPress site: ${config.wordpress.baseUrl}`);
console.log(`Content types to delete: ${contentTypes.join(", ")}`);
console.log(`Batch size: ${batchSize} items per batch`);
console.log(
  `Mode: ${dryRun ? "DRY RUN (no actual deletion)" : "LIVE DELETION"}`
);

// Require manual confirmation
if (!dryRun) {
  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  readline.question('Type "DELETE" to confirm: ', (answer) => {
    if (answer.trim() === "DELETE") {
      readline.close();
      deleteContent();
    } else {
      console.log("Deletion cancelled.");
      readline.close();
      process.exit(0);
    }
  });
} else {
  deleteContent();
}

// Helper function to delete a directory and all its contents recursively
function deleteDirRecursive(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach((file) => {
      const curPath = path.join(dirPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        // Recurse into subdirectories
        deleteDirRecursive(curPath);
      } else {
        // Delete files
        fs.unlinkSync(curPath);
      }
    });
    // Delete the empty directory itself
    fs.rmdirSync(dirPath);
  }
}

// Main deletion function
async function deleteContent() {
  console.log("Starting content deletion process...");
  try {
    // Clear the dist directory first
    const distPath = path.join(process.cwd(), "dist");
    console.log("Cleaning dist directory...");
    deleteDirRecursive(distPath);
    console.log("Dist directory cleaned.");

    // Delete pages if selected
    if (contentTypes.includes("pages")) {
      console.log("Will process pages...");
      await deleteAllContentOfType("pages", "page");
    }

    // Delete media if selected
    if (contentTypes.includes("media")) {
      console.log("Will process media...");
      await deleteAllContentOfType("media", "media");
    }

    console.log("Operation completed successfully.");
  } catch (error) {
    console.error("Error during deletion process:", error);
    process.exit(1);
  }
}

/**
 * Delete all content of a specific type
 * @param {string} typeName - Human-readable name (for logs)
 * @param {string} apiEndpoint - API endpoint name
 */
async function deleteAllContentOfType(typeName, apiEndpoint) {
  console.log(`\nProcessing ${typeName}...`);
  let totalItems = 0;
  let deletedItems = 0;
  let failedItems = 0;

  try {
    // Get the correct endpoint path based on the API endpoint name
    let endpointPath;
    if (apiEndpoint === "page") {
      endpointPath = "/wp/v2/pages";
    } else if (apiEndpoint === "media") {
      endpointPath = "/wp/v2/media";
    } else {
      throw new Error(`Unsupported endpoint: ${apiEndpoint}`);
    }

    console.log(`Using WP API endpoint for ${typeName}: ${endpointPath}`);
    console.log(`Fetching all ${typeName}...`);

    // Fetch all items at once with a large per_page parameter
    const allItems = await getAllItems(endpointPath);

    totalItems = allItems.length;
    console.log(`Found ${totalItems} ${typeName} to delete`);

    if (totalItems === 0) {
      console.log(`No ${typeName} found to delete.`);
      return;
    }

    // Prepare items for batch processing
    const itemBatches = [];
    for (let i = 0; i < allItems.length; i += batchSize) {
      itemBatches.push(allItems.slice(i, i + batchSize));
    }

    console.log(
      `Created ${itemBatches.length} batches with up to ${batchSize} items per batch`
    );

    // Process each batch
    for (let batchIndex = 0; batchIndex < itemBatches.length; batchIndex++) {
      const batch = itemBatches[batchIndex];
      console.log(
        `Processing batch ${batchIndex + 1}/${itemBatches.length} (${
          batch.length
        } ${typeName})...`
      );

      if (dryRun) {
        // In dry run mode, just list the items
        for (const item of batch) {
          const itemId = item.id;
          const itemTitle = item.title?.rendered || item.slug || itemId;
          console.log(
            `[DRY RUN] Would delete ${typeName.slice(
              0,
              -1
            )} #${itemId}: ${itemTitle}`
          );
        }
      } else {
        // In live mode, delete items one by one for better reliability
        for (const item of batch) {
          const itemId = item.id;
          const itemTitle = item.title?.rendered || item.slug || itemId;

          try {
            console.log(
              `Deleting ${typeName.slice(0, -1)} #${itemId}: ${itemTitle}...`
            );
            // Use Axios to delete the item
            await wpApi.delete(`${endpointPath}/${itemId}`, {
              params: { force: true },
            });
            deletedItems++;
            // Small delay between individual deletes
            await new Promise((resolve) => setTimeout(resolve, 300));
          } catch (error) {
            console.error(
              `Failed to delete ${typeName.slice(0, -1)} #${itemId}: ${
                error.message
              }`
            );
            failedItems++;
          }
        }
      }

      // Add a small delay between batches
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // Verify no items remain
    if (!dryRun) {
      await verifyAllDeleted();
    }
  } catch (error) {
    console.error(`Error processing ${typeName}:`, error);
    throw error;
  }

  console.log(`\n${typeName.toUpperCase()} SUMMARY:`);
  console.log(`Total ${typeName} found: ${totalItems}`);
  if (!dryRun) {
    console.log(`Successfully deleted: ${deletedItems}`);
    console.log(`Failed to delete: ${failedItems}`);
  }

  // Helper function to fetch all items, handling pagination automatically
  async function getAllItems(endpointPath) {
    const allItems = [];
    let page = 1;
    const perPage = 100; // Maximum allowed by WordPress API

    while (true) {
      console.log(`Fetching page ${page} of ${typeName}...`);

      try {
        // Fetch a page of items using Axios
        const response = await wpApi.get(endpointPath, {
          params: {
            per_page: perPage,
            page: page,
          },
        });

        const items = response.data;

        // If no items returned, we're done
        if (!items || !items.length) {
          break;
        }

        // Add items to the collection
        allItems.push(...items);
        console.log(`Retrieved ${items.length} ${typeName} from page ${page}`);

        // Check if there are more pages by looking at the total pages header
        const totalPages = parseInt(response.headers["x-wp-totalpages"], 10);
        if (isNaN(totalPages) || page >= totalPages) {
          break;
        }

        // Move to the next page
        page++;
      } catch (error) {
        // If we get a 400 status code, we've likely reached the end of pagination
        if (error.response && error.response.status === 400) {
          console.log(`Reached end of pagination (no more pages available)`);
          break;
        }

        console.error(
          `Error fetching ${typeName} page ${page}:`,
          error.message
        );
        if (error.response) {
          console.error(`Status: ${error.response.status}`);
        }
        throw error;
      }
    }

    return allItems;
  }

  // Helper function to verify all items were deleted
  async function verifyAllDeleted() {
    console.log(`\nVerifying all ${typeName} have been deleted...`);

    try {
      const response = await wpApi.get(endpointPath, {
        params: { per_page: 100 },
      });
      const remainingItems = response.data;

      if (remainingItems && remainingItems.length > 0) {
        console.log(
          `⚠️ WARNING: Found ${remainingItems.length} remaining ${typeName}!`
        );
        console.log(`Attempting one final cleanup...`);

        for (const item of remainingItems) {
          const itemId = item.id;
          const itemTitle = item.title?.rendered || item.slug || itemId;

          try {
            console.log(
              `Final cleanup: Deleting ${typeName.slice(
                0,
                -1
              )} #${itemId}: ${itemTitle}...`
            );
            await wpApi.delete(`${endpointPath}/${itemId}`, {
              params: { force: true },
            });
            deletedItems++;
            // Add a longer delay for the final cleanup
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (error) {
            console.error(
              `Failed to delete remaining ${typeName.slice(
                0,
                -1
              )} #${itemId}: ${error.message}`
            );
            failedItems++;
          }
        }

        // One final check
        const finalCheckResponse = await wpApi.get(endpointPath, {
          params: { per_page: 100 },
        });
        const finalCheck = finalCheckResponse.data;

        if (finalCheck && finalCheck.length > 0) {
          console.log(
            `⚠️ FINAL WARNING: ${finalCheck.length} ${typeName} could not be deleted.`
          );
          console.log(
            `These may require manual deletion through the WordPress admin interface.`
          );
        } else {
          console.log(`✅ Successfully deleted all ${typeName}!`);
        }
      } else {
        console.log(`✅ Verified: All ${typeName} successfully deleted!`);
      }
    } catch (error) {
      console.error(`Error during verification: ${error.message}`);
      if (error.response) {
        console.error(`Status: ${error.response.status}`);
      }
    }
  }
}
