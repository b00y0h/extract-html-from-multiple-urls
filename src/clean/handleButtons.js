function handleButtons($) {
  $("a.btn").each((i, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();
    $(el).replaceWith(
      `<!-- wp:wsuwp/button {"buttonText":"${text}","buttonUrl":"${href}"} /-->\n`
    );
  });
}

module.exports = { handleButtons };
