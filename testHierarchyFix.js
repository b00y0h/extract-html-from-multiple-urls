require("dotenv").config();
const { postToWordPress, findPageByPath } = require("./src/postToWordpress");
const { verifyParentHierarchy } = require("./src/utils/urls");

// Test paths
const TEST_PATHS = [
  {
    url: "about/stories/cougar-quarterly",
    content:
      "<p>This is a test page for the Cougar Quarterly in the correct stories section.</p>",
    title: "Cougar Quarterly (Stories)",
  },
  {
    url: "about/publications/report",
    content:
      "<p>This is a test page for the Report in publications section.</p>",
    title: "Report (Publications)",
  },
];

async function runTest() {
  console.log("Starting hierarchy test...");

  try {
    for (const testPath of TEST_PATHS) {
      console.log(`\n---------------------------------------------`);
      console.log(`Testing path: ${testPath.url}`);

      // First, check if this page already exists at the correct path
      const existingPage = await findPageByPath(testPath.url);
      if (existingPage) {
        console.log(
          `Page already exists at path ${testPath.url} with ID: ${existingPage}`
        );
        continue;
      }

      // Verify the parent hierarchy
      console.log("Verifying parent hierarchy...");
      await verifyParentHierarchy(testPath.url, "Create");

      // Create the actual page
      console.log("Creating the test page...");
      const result = await postToWordPress(
        testPath.url,
        testPath.content,
        testPath.title,
        "Create"
      );

      console.log(`Created page with ID: ${result.pageId}`);

      // Verify the page was created at the correct path
      const pageAfterCreation = await findPageByPath(testPath.url);
      if (pageAfterCreation) {
        console.log(
          `✅ Verification successful: Page exists at correct path ${testPath.url} with ID: ${pageAfterCreation}`
        );
      } else {
        console.log(
          `❌ Verification failed: Page was not found at path ${testPath.url}`
        );
      }
    }

    console.log("\nHierarchy test completed!");
  } catch (error) {
    console.error(`Test failed with error: ${error.message}`);
    console.error(error.stack);
  }
}

// Run the test
runTest();
