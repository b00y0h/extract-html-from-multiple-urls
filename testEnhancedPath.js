require("dotenv").config();
const { findPageByExactPath } = require("./src/utils/pathUtils");
const { postToWordPress } = require("./src/postToWordpress");

// Test paths
const TEST_PATHS = [
  "/about/stories/cougar-quarterly/cougar-quarterly-winter-2025-alumni-spotlight",
  "/about/publications/cougar-quarterly/cougar-quarterly-winter-2023-alumni",
  "/about/publications/cougar-quarterly__trashed/cougar-quarterly-winter-2025-alumni-spotlight/",
];

async function runTest() {
  console.log("Starting enhanced path test...");

  try {
    for (const testPath of TEST_PATHS) {
      console.log(`\n---------------------------------------------`);
      console.log(`Testing path: ${testPath}`);

      // Test finding by path with the enhanced function
      console.log("\nRunning enhanced path lookup:");
      const existingPathPage = await findPageByExactPath(testPath);

      console.log(
        `\nResult: ${
          existingPathPage
            ? `✅ Found page with ID: ${existingPathPage}`
            : "❌ No page found with enhanced lookup"
        }`
      );
    }

    console.log("\n---------------------------------------------");
    console.log("Enhanced path test completed!");
  } catch (error) {
    console.error(`Test failed with error: ${error.message}`);
    console.error(error.stack);
  }
}

// Run the test
runTest();
