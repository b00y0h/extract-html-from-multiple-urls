const cheerio = require("cheerio");
const { handleParagraphs } = require("./handleParagraphs");

function handleBlockquotes($) {
  $("blockquote").each(function () {
    // Create a new cheerio instance for the blockquote's HTML
    const blockquoteHtml = $(this).html();
    const $bq = cheerio.load(`<div>${blockquoteHtml}</div>`, null, false);

    // Use handleParagraphs to process the blockquote's content
    handleParagraphs($bq);

    // Get the processed HTML (without the outer div)
    const processedContent = $bq("div").html();

    // Replace the blockquote with the correct WP block structure
    $(this).replaceWith(
      `<!-- wp:quote -->\n<blockquote class=\"wp-block-quote\">${processedContent}</blockquote>\n<!-- /wp:quote -->`
    );
  });
}

module.exports = { handleBlockquotes };
