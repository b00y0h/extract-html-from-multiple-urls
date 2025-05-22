require("dotenv").config();
const { findPageBySlug, findPageByPath } = require("./src/postToWordpress");

async function testHierarchicalLookup() {
  try {
    console.log("🧪 TESTING HIERARCHICAL PAGE LOOKUP");

    // Test finding a page by slug at different levels of the hierarchy
    console.log("\n🔍 Testing findPageBySlug");

    // 1. Find "about" at root level (parent=0)
    const rootAboutPage = await findPageBySlug("about", 0);
    console.log(`Root level "about" page ID: ${rootAboutPage || "Not found"}`);

    // 2. Find all "about" pages
    const allAboutPages = await findPageBySlug("about");
    console.log(`First "about" page found ID: ${allAboutPages || "Not found"}`);

    // Test finding pages by full path
    console.log("\n🔍 Testing findPageByPath");

    // 1. Find "/about" page
    const aboutPath = await findPageByPath("about");
    console.log(`"/about" page ID: ${aboutPath || "Not found"}`);

    // 2. Find "/home/about" page
    const homeAboutPath = await findPageByPath("home/about");
    console.log(`"/home/about" page ID: ${homeAboutPath || "Not found"}`);

    // 3. Find "/academics/library/about" page
    const academicsLibraryAboutPath = await findPageByPath(
      "academics/library/about"
    );
    console.log(
      `"/academics/library/about" page ID: ${
        academicsLibraryAboutPath || "Not found"
      }`
    );

    console.log("\n✅ Hierarchical page lookup tests completed");
  } catch (error) {
    console.error("❌ Error during testing:", error.message);
  }
}

testHierarchicalLookup();
