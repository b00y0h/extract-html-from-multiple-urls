function handleTables($) {
  // Handle tables
  $("table").each((i, el) => {
    const $table = $(el);
    const $caption = $table.find("caption");
    let captionText = "";
    $table.removeAttr("class");

    if ($caption.length) {
      captionText = $caption.text().trim();
      $caption.remove();
    }

    $table.wrap('<figure class="wp-block-table"></figure>');
    if (captionText) {
      $table.after(
        `\n<figcaption class="wp-element-caption">${captionText}</figcaption>`
      );
    }

    $table.parent().before("<!-- wp:table -->");
    $table.parent().after("<!-- /wp:table -->");
  });

  // Clean up table attributes
  $('td[scope="row"]').removeAttr("scope");
}

module.exports = { handleTables };
