function handleImageLinks($) {
  // Remove WordPress block comments
  $("*")
    .contents()
    .each(function () {
      if (this.nodeType === 8) {
        // Node type 8 is a comment node
        $(this).remove();
      }
    });

  // Handle images wrapped in figure tags
  $("figure.wp-block-image").each(function () {
    const $figure = $(this);
    const $link = $figure.find("a");
    const $image = $figure.find("img");

    if ($link.length && $image.length) {
      const href = $link.attr("href");
      const src = $image.attr("src");
      const alt = $image.attr("alt") || "";

      // Replace the figure with a clean linked image
      $figure.replaceWith(
        `<a href="${href}"><img src="${src}" alt="${alt}" class="img-responsive"></a>`
      );
    }
  });

  // Handle direct image links (from previous implementation)
  $("a").each(function () {
    const $link = $(this);
    const $image = $link.find("img");

    if ($image.length && !$link.parent().is("figure")) {
      const src = $image.attr("src");
      const alt = $image.attr("alt") || "";
      const href = $link.attr("href");

      // Create a clean image tag inside the link
      $link.html(`<img src="${src}" alt="${alt}" class="img-responsive">`);
    }
  });
}

module.exports = { handleImageLinks };
