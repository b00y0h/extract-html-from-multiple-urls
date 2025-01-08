function replaceSpans($) {
  $("span").each((i, el) => {
    $(el).replaceWith($(el).html());
  });
}

module.exports = { replaceSpans };
