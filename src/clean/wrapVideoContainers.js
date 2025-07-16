function wrapVideoContainers($) {
  // Replace video containers with a neutral div, not a <p>
  $("div.video-container").each((i, el) => {
    // Use a div with a special class so it can be handled by handleParagraphs if needed
    $(el).replaceWith(`<div class="video-block">${$(el).html().trim()}</div>`);
  });
}

module.exports = { wrapVideoContainers };
