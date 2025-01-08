function handleHeadings($) {
  // Handle headings
  $("h1, h2, h3, h4, h5, h6").each((i, el) => {
    const level = el.tagName.charAt(1);
    const text = $(el).html().trim();
    $(el).replaceWith(
      `<!-- wp:heading {"level":${level}} -->\n<h${level} class="wp-block-heading">${text}</h${level}>\n<!-- /wp:heading -->\n`
    );
  });
}

module.exports = { handleHeadings };
