function handleLists($) {
  // Handle lists
  $("ul").each((i, el) => {
    $(el).before("<!-- wp:list -->\n").after("\n<!-- /wp:list -->");
  });
  $("li").each((i, el) => {
    $(el).before("<!-- wp:list-item -->\n").after("\n<!-- /wp:list-item -->");
  });
}

module.exports = { handleLists };
