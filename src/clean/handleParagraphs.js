function handleParagraphs($) {
  // Remove br tags
  $("br").remove();

  // First handle divs that contain text or inline elements
  $("div").each(function () {
    const $this = $(this);

    // Skip if the div contains a blockquote
    if ($this.find("blockquote").length > 0) {
      return;
    }

    const children = $this.children();

    // Process direct child elements
    children.each(function (i, el) {
      const $child = $(el);

      // Skip if it's already a paragraph
      if ($child.is("p")) {
        return;
      }

      // If it's an inline element (like an anchor), wrap it in a paragraph
      if ($child.is("a, span, em, strong, b, i")) {
        // Skip if it's a button (has btn class)
        if ($child.hasClass("btn")) {
          return;
        }
        const html = $child.clone().wrap("<div>").parent().html();
        $child.replaceWith(
          `<!-- wp:paragraph -->\n<p>${html}</p>\n<!-- /wp:paragraph -->\n`
        );
      }
    });

    // Handle text nodes that are direct children of the div
    const textNodes = $this.contents().filter(function () {
      return this.nodeType === 3 && this.nodeValue.trim().length > 0;
    });

    textNodes.each(function () {
      const text = $(this).text().trim();
      if (text) {
        $(this).replaceWith(
          `<!-- wp:paragraph -->\n<p>${text}</p>\n<!-- /wp:paragraph -->\n`
        );
      }
    });
  });

  // Handle existing paragraphs
  $("p").each(function () {
    const $this = $(this);
    const html = $this.html().trim();
    const hasCenter = $this.hasClass("center");

    if ($this.text().trim() === "") {
      // Remove empty paragraphs
      $this.remove();
      return;
    }

    // Check for buttons within paragraphs
    const $btn = $this.find("a.btn");
    if ($btn.length > 0) {
      // Let the button handler deal with this
      const btnHtml = $btn.clone().wrap("<div>").parent().html();
      $this.replaceWith(btnHtml);
      return;
    }

    // Handle regular paragraphs, with proper escaping for centered paragraphs
    const className = hasCenter ? " wsu-align-item\\u002d\\u002dcenter" : "";
    const classAttr = className ? `{"className":"${className}"}` : "";
    const blockAttr = classAttr ? ` ${classAttr}` : "";
    const displayClassName = hasCenter ? " wsu-align-item--center" : "";

    $this.replaceWith(
      `<!-- wp:paragraph${blockAttr} -->\n<p${
        displayClassName ? ` class="${displayClassName}"` : ""
      }>${html}</p>\n<!-- /wp:paragraph -->\n`
    );
  });
}

module.exports = { handleParagraphs };
