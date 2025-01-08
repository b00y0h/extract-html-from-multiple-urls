function removeSpecificTags($) {
  $("a#main-content").remove();
  $('a[href="#main-content"]:contains("Back to top")').remove();
  $("div:empty").remove();
  $("style").remove();
  $("br").remove();
}

module.exports = { removeSpecificTags };
