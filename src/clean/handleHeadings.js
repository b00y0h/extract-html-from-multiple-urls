function handleHeadings($) {
  // Handle headings
  $("h1, h2, h3, h4, h5, h6").each((i, el) => {
    const $el = $(el);
    const level = el.tagName.charAt(1);
    const text = $el.html().trim();
    const hasCenter = $el.hasClass("center");

    const attributes = {
      level: parseInt(level),
    };

    if (hasCenter) {
      attributes.textAlign = "center";
      attributes.className = "";
    }

    const attrString = JSON.stringify(attributes);
    const centerClass = hasCenter ? " has-text-align-center" : "";

    $el.replaceWith(
      `<!-- wp:heading ${attrString} -->\n<h${level} class="wp-block-heading${centerClass}">${text}</h${level}>\n<!-- /wp:heading -->\n`
    );
  });
}

module.exports = { handleHeadings };
