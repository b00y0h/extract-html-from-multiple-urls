/**
 * Test the new WordPressPageHierarchy implementation
 */

const { verifyParentHierarchy } = require("./src/utils/urls");

async function testPageHierarchy() {
  console.log("Testing WordPress Page Hierarchy Resolution");
  console.log("==========================================");

  const testUrls = [
    "https://example.com/about",
    "https://example.com/about/team",
    "https://example.com/about/team/leadership",
    "https://example.com/services/web-development",
    "https://example.com/blog/2023/january/first-post",
  ];

  for (const url of testUrls) {
    console.log(`\nTesting URL: ${url}`);
    try {
      const result = await verifyParentHierarchy(url, "Create");
      console.log(
        `Result: ${
          result !== null ? `Success (Parent ID: ${result})` : "Failed"
        }`
      );
    } catch (error) {
      console.error(`Error testing ${url}:`, error.message);
    }
  }
}

// Run the test
testPageHierarchy().catch((error) => {
  console.error("Test failed:", error);
});
