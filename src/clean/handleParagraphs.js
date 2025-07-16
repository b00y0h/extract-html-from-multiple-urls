function handleParagraphs($) {
  // First handle divs that contain only text
  $("div").each(function() {
    const $this = $(this);
    // Check if the div only contains text nodes and whitespace
    if ($this.children().length === 0 && $this.text().trim().length > 0) {
      const text = $this.text().trim();
      // Keep the original div but wrap its content in a paragraph
      $this.html(`<!-- wp:paragraph -->\n<p>${text}</p>\n<!-- /wp:paragraph -->\n`);
    }
  });

  // Handle existing paragraphs
  $("p").each(function () {
    const $this = $(this);
    const html = $this.html().trim();
    const hasCenter = $this.hasClass('center');

    if ($this.text().trim() === "") {
      // Remove empty paragraphs
      $this.remove();
    } else {
      // Handle regular paragraphs, with proper escaping for centered paragraphs
      const className = hasCenter ? ' wsu-align-item\\u002d\\u002dcenter' : '';
      const classAttr = className ? `{"className":"${className}"}` : '';
      const blockAttr = classAttr ? ` ${classAttr}` : '';
      const displayClassName = hasCenter ? ' wsu-align-item--center' : '';
      
      $this.replaceWith(
        `<!-- wp:paragraph${blockAttr} -->\n<p${displayClassName ? ` class="${displayClassName}"` : ''}>${html}</p>\n<!-- /wp:paragraph -->\n`
      );
    }
  });
}

module.exports = { handleParagraphs };
