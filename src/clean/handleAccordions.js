function handleAccordions($) {
  $(".card-header.panel-heading").each(function () {
    const $header = $(this);
    const headerId = $header.attr("id");
    const $title = $header.find("button.display").text().trim();

    // Find the corresponding content div
    const $content = $(`[aria-labelledby="${headerId}"]`);

    if ($content.length) {
      // Get the content HTML
      const contentHtml = $content.find(".field--item").html();

      if (contentHtml) {
        // Create WordPress accordion block
        const accordionBlock = `<!-- wp:wsuwp/accordion {"title":"${$title}"} -->\n${contentHtml}\n<!-- /wp:wsuwp/accordion -->\n`;

        // Replace both the header and content divs with the new block
        $header.replaceWith(accordionBlock);
        $content.remove();
      }
    }
  });
}

module.exports = { handleAccordions };
