function removeScripts($) {
  // Remove all script tags and their contents
  $("script").each(function () {
    $(this).remove();
  });
}

module.exports = { removeScripts };
