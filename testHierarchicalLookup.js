require("dotenv").config();
const { findPageByFullPath } = require("./src/utils/hierarchicalPageLookup");

// Test paths
const testPaths = [
  "/academics/library/about",
  "/about",
  "/academics",
  "/student-life-and-support/writing-center",
];

async function runTests() {
  console.log("Testing hierarchical page lookup...");

  for (const path of testPaths) {
    console.log(`\nLooking up: ${path}`);
    const result = await findPageByFullPath(path);

    if (result) {
      console.log(`✅ Found: ID ${result.id}, Title: "${result.title}"`);
    } else {
      console.log(`❌ Not found: ${path}`);
    }
  }
}

runTests().catch((error) => {
  console.error("Error during test:", error);
});
