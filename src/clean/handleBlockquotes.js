function handleBlockquotes($) {
  $("blockquote").each(function () {
    const content = $(this).html();
    $(this).replaceWith(
      `<!-- wp:quote -->
      <blockquote class="wp-block-quote">
      <!-- wp:paragraph -->
      <p>${content}</p>
      <!-- /wp:paragraph -->
      </blockquote>
      <!-- /wp:quote -->`
    );
  });
}

module.exports = { handleBlockquotes };
