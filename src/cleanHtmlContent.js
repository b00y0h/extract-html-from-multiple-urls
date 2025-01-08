require("dotenv").config();
const cheerio = require("cheerio");
const {
  removeComments,
  removeSpecificTags,
  handleIframes,
  replaceSpans,
  wrapVideoContainers,
  handleImages,
  handleBlockquotes,
  cleanUpContent,
  handleParagraphs,
  handleButtons,
  handleForms,
  handleHeadings,
  handleLists,
  handleTables,
  handleHorizontalRules,
} = require("./clean/");

async function transformToWPBlocks(contentHtml, originalUrl) {
  console.log("\n🔄 TRANSFORM START ---------------------");
  console.log("🌐 Original URL:", originalUrl);

  try {
    const $ = cheerio.load(contentHtml);
    console.log("✅ Content loaded into cheerio");
    console.log("📊 Initial content stats:");
    console.log("- Total elements:", $("*").length);
    console.log("- Images found:", $("img").length);
    console.log(
      "- Main content area:",
      $('div[role="main"]').length ? "Found" : "Not found"
    );
    console.log("- Sections found:", $("section").length);

    const rootUrl = getRootUrl(originalUrl);

    if (!rootUrl) {
      throw new Error(`Invalid root URL derived from: ${originalUrl}`);
    }

    // Remove commented-out content
    removeComments($);

    // Remove specific <a> tags
    removeSpecificTags($);

    // Handle <iframe> tags
    handleIframes($);

    // Replace <span> tags but keep their content
    replaceSpans($);

    // Wrap video container content in <p>
    wrapVideoContainers($);

    // Handle images with proper URL resolution
    handleImages($, rootUrl);

    // Handle blockquotes
    handleBlockquotes($);

    // Clean up content
    cleanUpContent($);

    // Handle paragraphs
    handleParagraphs($);

    // Convert <a> tags with class 'btn' to WordPress button blocks
    handleButtons($);

    // Handle <form> tags
    handleForms($, rootUrl);

    // Handle headings
    handleHeadings($);

    // Handle lists
    handleLists($);

    // Handle tables
    handleTables($);

    // Handle horizontal rules
    handleHorizontalRules($);

    // Final cleanup and return
    const finalContent = $("body")
      .html()
      .replace(/^\s*[\r\n]/gm, "")
      .replace(/^\s+/gm, "");

    console.log("✅ Content transformation complete");
    console.log("🔄 TRANSFORM END ---------------------\n");

    return Promise.resolve(finalContent);
  } catch (error) {
    console.error("💥 Error in transformToWPBlocks:", error);
    console.log("🔄 TRANSFORM END (WITH ERROR) ---------------------\n");
    throw error;
  }
}

function ensureUrlProtocol(url) {
  if (!/^https?:\/\//i.test(url)) {
    return `https://${url}`;
  }
  return url;
}

// Extract the root URL (protocol and host) from a given URL
function getRootUrl(url) {
  try {
    url = ensureUrlProtocol(url);
    const parsedUrl = new URL(url);
    return `${parsedUrl.protocol}//${parsedUrl.host}`;
  } catch (error) {
    console.error("Invalid URL:", error, "Input URL:", url);
    return null;
  }
}

module.exports = { transformToWPBlocks };
