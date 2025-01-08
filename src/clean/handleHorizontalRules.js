function handleHorizontalRules($) {
  $("hr").each(function () {
    $(this).replaceWith(`
      <!-- wp:separator -->
      <hr class="wp-block-separator has-alpha-channel-opacity"/>
      <!-- /wp:separator -->
    `);
  });
}

module.exports = { handleHorizontalRules };
