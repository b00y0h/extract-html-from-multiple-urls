function wrapVideoContainers($) {
  $("div.video-container").each((i, el) => {
    $(el).replaceWith(`<p>${$(el).html().trim()}</p>`);
  });
}

module.exports = { wrapVideoContainers };
