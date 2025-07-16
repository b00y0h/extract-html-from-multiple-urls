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
    handleButtons($);
    // Pass the computedUrl which is the WordPress destination where the form should live
    handleForms($, rootUrl, computedUrl);
    handleHeadings($);
    handleLists($);
    handleTables($);
    handleHorizontalRules($);
    // Move handleParagraphs to the very end to wrap all paragraphs after all other handlers
    handleParagraphs($);

    console.log("🧹 Starting content cleanup...");
    let content = $("body").html();

    // Apply the image block replacer if it exists
    if (
      $.imageBlockReplacer &&
      $.imageBlockData &&
      $.imageBlockData.length > 0
    ) {
      console.log(
        `🖼️ Applying image block replacements for ${$.imageBlockData.length} images...`
      );
      content = $.imageBlockReplacer(content);
    } else {
      console.log(
        `⚠️ No image blocks to replace or replacer function not available`
      );
    }

    // Check if we need to add an emergency image block
    const wpImageBlocks = (content.match(/<!-- wp:image/g) || []).length;
    if (
      wpImageBlocks === 0 &&
      $.processedImageData &&
      $.processedImageData.length > 0
    ) {
      console.log(
        `⚠️ No image blocks found in final HTML! Emergency insertion needed.`
      );

      // Find the first heading to insert after
      if (
        content.includes("</h1>") &&
        content.includes("<!-- /wp:heading -->")
      ) {
        console.log(`🔍 Found heading to insert image after`);

        // Get the first processed image data
        const firstImage = $.processedImageData[0];

        // Insert the image block after the first heading
        content = content.replace(
          "</h1>\n<!-- /wp:heading -->",
          "</h1>\n<!-- /wp:heading -->\n\n" + firstImage.block + "\n\n"
        );

        console.log(`✅ Emergency image insertion completed`);
      }
    }

    // Clean up any remaining artifacts
    content = content
      // Preserve line breaks in WordPress blocks
      .replace(/(\s+)(?!(wp:|\/wp:))/g, " ") // Only replace whitespace not followed by wp: or /wp:
      .replace(/> </g, ">\n<")
      .replace(/<!--\s*wp:/g, "<!-- wp:")
      .replace(/-->\s*</g, "-->\n<")
      // Ensure proper spacing around WordPress blocks
      .replace(/(<!-- wp:.*? -->)/g, "\n$1\n")
      .replace(/(<!-- \/wp:.*? -->)/g, "\n$1\n")
      .trim();

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
