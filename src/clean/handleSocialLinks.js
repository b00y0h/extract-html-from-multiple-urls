function handleSocialLinks($) {
  // Remove all paragraphs with class "social" and their contents using Cheerio
  $("p.social").replaceWith("");
}

module.exports = { handleSocialLinks };
