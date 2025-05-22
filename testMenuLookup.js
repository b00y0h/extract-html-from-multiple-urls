require("dotenv").config();
const { logMessage } = require("./src/utils/logs");
const config = require("./src/config");
const { findPageByFullPath } = require("./src/utils/hierarchicalPageLookup");

// Test menu items that need to be looked up
const testItems = [
  { slug: "academics/library/about", title: "Library About Page" },
  { slug: "about", title: "About Page" },
  { slug: "academics", title: "Academics Page" },
];

async function testMenuLookup() {
  console.log("Testing menu item lookup...");
  logMessage("Starting menu item lookup test", config.paths.createMenuLogFile);

  for (const item of testItems) {
    console.log(`\nProcessing: ${item.slug}`);
    logMessage(
      `Processing test item: ${item.slug}`,
      config.paths.createMenuLogFile
    );

    // Try to find the page using hierarchical lookup
    const pageInfo = await findPageByFullPath(item.slug);

    if (pageInfo) {
      console.log(`✅ Found: ID ${pageInfo.id}, Title: "${pageInfo.title}"`);
      logMessage(
        `Found page with ID ${pageInfo.id}, title "${pageInfo.title}" for slug "${item.slug}"`,
        config.paths.createMenuLogFile
      );
    } else {
      console.log(`❌ Not found: ${item.slug}`);
      logMessage(
        `Page not found for slug: ${item.slug}`,
        config.paths.createMenuLogFile
      );
    }
  }
}

testMenuLookup().catch((error) => {
  console.error("Error during test:", error);
  logMessage(
    `Error during test: ${error.message}`,
    config.paths.createMenuLogFile
  );
});
