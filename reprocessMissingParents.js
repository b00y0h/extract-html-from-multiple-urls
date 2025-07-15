/**
 * Reprocess Missing Parent URLs
 *
 * This script will reprocess URLs that were skipped because they were missing parent pages.
 * It ensures strict hierarchical processing by sorting URLs by depth level and processing
 * all URLs of one level before moving to the next.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { checkUrls } = require("./index");
const { sortUrlsByHierarchy } = require("./src/utils/urls");

async function reprocessMissingParentUrls() {
  console.log("====================================================");
  console.log("Reprocessing URLs with Missing Parents - Hierarchical");
  console.log("====================================================");

  // Check if missing parents log exists
  const missingParentsLogPath = path.join(__dirname, "missing_parents.txt");

  if (!fs.existsSync(missingParentsLogPath)) {
    console.log("No missing parents log found. Run the main migration first.");
    return;
  }

  // Read the missing parents file
  const fileContent = fs.readFileSync(missingParentsLogPath, "utf8");
  const urls = fileContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (urls.length === 0) {
    console.log("No URLs with missing parents found to reprocess.");
    return;
  }

  console.log(`Found ${urls.length} URLs with missing parents to reprocess.`);

  // Convert URLs to the format expected by checkUrls and sortUrlsByHierarchy
  const urlObjects = urls.map((url) => ({
    originalUrl: url,
    computedUrl: url,
    action: "Move",
  }));

  console.log("\nSorting URLs by hierarchy level...");

  // Sort the URLs by hierarchy depth to ensure proper processing order
  const { urlsByLevel, maxLevel } = sortUrlsByHierarchy(urlObjects);

  // Display the URLs grouped by level for better visibility
  console.log("\n📊 Reprocessing Plan by Hierarchy Level:");
  for (let level = 0; level <= maxLevel; level++) {
    if (urlsByLevel[level] && urlsByLevel[level].length > 0) {
      console.log(
        `\n📑 LEVEL ${level} URLS (${urlsByLevel[level].length} pages):`
      );
      urlsByLevel[level].forEach((url, index) => {
        console.log(`  ${index + 1}. ${url.computedUrl}`);
      });
    }
  }

  // Back up the original missing parents file
  const timestamp = new Date().toISOString().replace(/:/g, "-");
  const backupPath = `${missingParentsLogPath}.${timestamp}.bak`;
  fs.copyFileSync(missingParentsLogPath, backupPath);
  console.log(`\nBacked up missing parents file to ${backupPath}`);

  // Clear the missing parents file for this run
  fs.writeFileSync(missingParentsLogPath, "");

  console.log("\n🚀 Starting hierarchical reprocessing...");

  // Process the URLs using the main checkUrls function
  await checkUrls(urlObjects);

  // Check if any URLs are still missing after reprocessing
  if (
    fs.existsSync(missingParentsLogPath) &&
    fs.readFileSync(missingParentsLogPath, "utf8").trim().length > 0
  ) {
    const remainingContent = fs.readFileSync(missingParentsLogPath, "utf8");
    const remainingUrls = remainingContent
      .split("\n")
      .filter((line) => line.trim().length > 0);

    console.log(
      `\n⚠️ ${remainingUrls.length} URLs still have missing parents after reprocessing.`
    );
    console.log(
      "You may need to run this script again or manually create the missing parent pages."
    );
  } else {
    console.log("\n✅ All URLs were successfully processed!");
  }
}

// Run the reprocessing
reprocessMissingParentUrls().catch((error) => {
  console.error("Error reprocessing missing parent URLs:", error);
});
