function handleParagraphs($) {
  $("p").each(function () {
    const $this = $(this);
    const html = $this.html().trim();

    // Check if paragraph contains only buttons
    if (
      ($this.children("a.btn-solid, a.btn-default").length > 0 &&
        $this.children("a.btn-solid, a.btn-default").length ===
          $this.children().length) ||
      html.includes("wp:wsuwp/button")
    ) {
      // Replace the paragraph with just its contents
      $this.replaceWith(html);
    } else if ($this.text().trim() === "") {
      // Remove empty paragraphs
      $this.remove();
    } else {
      // Replace non-empty paragraphs with the desired format
      $this.replaceWith(
        `<!-- wp:paragraph -->\n<p>${$this.html()}</p>\n<!-- /wp:paragraph -->\n`
      );
    }
  });
}

module.exports = { handleParagraphs };
