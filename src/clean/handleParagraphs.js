function handleParagraphs($) {
  $("p").each(function () {
    const $this = $(this);

    // Check if paragraph contains only anchor tags with btn-default class
    if (
      $this.children("a.btn-default").length > 0 &&
      $this.children("a.btn-default").length === $this.children().length
    ) {
      // Replace the paragraph with just its anchor tags
      $this.replaceWith($this.html());
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
