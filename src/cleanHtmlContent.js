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
  removeScripts,
  handleImageLinks,
  handleSocialLinks,
  handleAccordions,
} = require("./clean/");
const { getRootUrl } = require("./utils/urls");

async function transformToWPBlocks(
  contentHtml,
  originalUrl,
  mediaResults = [],
  computedUrl = null
) {
  console.log("\n🔄 TRANSFORM START ---------------------");
  console.log("🌐 Original URL:", originalUrl);
  console.log("🎯 WordPress Destination URL:", computedUrl || "Not specified");

  try {
    const $ = cheerio.load(contentHtml);
    console.log("✅ Content loaded into cheerio");
    console.log("📊 Initial content stats:");
    console.log("- Total elements:", $("*").length);
    console.log("- Images found:", $("img").length);
    console.log("- Sections found:", $("section").length);

    const rootUrl = getRootUrl(originalUrl);

    if (!rootUrl) {
      throw new Error(`Invalid root URL derived from: ${originalUrl}`);
    }

    // Process the content
    removeScripts($);
    handleSocialLinks($);
    removeComments($);
    removeSpecificTags($);
    handleIframes($);
    replaceSpans($);
    wrapVideoContainers($);
    handleImageLinks($);
    handleImages($, rootUrl, mediaResults); // This will now have the media results
    handleBlockquotes($);
    handleAccordions($);
    cleanUpContent($);
    handleParagraphs($);
    handleButtons($);
    // Pass the computedUrl which is the WordPress destination where the form should live
    handleForms($, rootUrl, computedUrl);
    handleHeadings($);
    handleLists($);
    handleTables($);
    handleHorizontalRules($);

    console.log("🧹 Starting content cleanup...");
    let content = $.html();

    // Clean up any remaining artifacts
    content = content
      .replace(/\s+/g, " ")
      .replace(/> </g, ">\n<")
      .replace(/<!--\s*wp:/g, "<!-- wp:")
      .replace(/-->\s*</g, "-->\n<")
      .trim();

    console.log("✨ Content cleanup complete");
    console.log("🔄 TRANSFORM END ---------------------\n");

    return {
      content,
      images: [], // We don't need to extract images here anymore
    };
  } catch (error) {
    console.error("💥 Error in transformToWPBlocks:", error);
    console.log("🔄 TRANSFORM END (WITH ERROR) ---------------------\n");
    throw error;
  }
}

module.exports = {
  transformToWPBlocks,
};
