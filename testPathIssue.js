require("dotenv").config();
const {
  postToWordPress,
  findPageByPath,
  findPageBySlug,
} = require("./src/postToWordpress");
const { verifyParentHierarchy } = require("./src/utils/urls");

// Test paths
const TEST_PATHS = [
  "/about/stories/cougar-quarterly/cougar-quarterly-winter-2025-alumni-spotlight",
];

async function runTest() {
  console.log("Starting path test...");

  try {
    for (const testPath of TEST_PATHS) {
      console.log(`\n---------------------------------------------`);
      console.log(`Testing path: ${testPath}`);

      // Test finding by path
      console.log("\nTest 1: Find by full path");
      const existingPathPage = await findPageByPath(testPath);
      console.log(
        `Result: ${
          existingPathPage
            ? `Page found with ID: ${existingPathPage}`
            : "No page found by path"
        }`
      );

      // Break down the path and find each component
      const pathSegments = testPath
        .replace(/^\/|\/$/g, "")
        .split("/")
        .filter(Boolean);
      console.log(`\nPath segments: ${JSON.stringify(pathSegments)}`);

      // Test finding each level of the hierarchy
      console.log("\nTest 2: Find each level in the hierarchy");
      let parentId = 0;
      for (let i = 0; i < pathSegments.length; i++) {
        const segment = pathSegments[i];
        console.log(
          `\nLooking for segment ${i + 1}/${pathSegments.length}: ${segment}`
        );
        console.log(`With parent ID: ${parentId}`);

        const pageId = await findPageBySlug(segment, parentId);
        console.log(
          `Result: ${
            pageId ? `Found page with ID: ${pageId}` : "No page found"
          }`
        );

        if (pageId) {
          parentId = pageId;
        } else {
          break;
        }
      }

      // Test the complete post process with the path
      console.log("\nTest 3: Verify complete parent hierarchy");
      try {
        const parentHierarchyId = await verifyParentHierarchy(testPath, "Move");
        console.log(
          `Result: ${
            parentHierarchyId
              ? `Valid hierarchy with parent ID: ${parentHierarchyId}`
              : "Invalid hierarchy"
          }`
        );
      } catch (error) {
        console.log(`Error: ${error.message}`);
      }
    }

    console.log("\nPath test completed!");
  } catch (error) {
    console.error(`Test failed with error: ${error.message}`);
    console.error(error.stack);
  }
}

// Run the test
runTest();
