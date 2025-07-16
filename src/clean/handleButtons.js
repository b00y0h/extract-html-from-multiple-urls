function handleButtons($) {
  $("a.btn").each((i, el) => {
    const $el = $(el);
    const href = $el.attr("href");
    const text = $el.text().trim();
    const hasCenter = $el.hasClass("center") || $el.parent().hasClass("center");
    const className = hasCenter
      ? ',"className":" wsu-text-align\\u002d\\u002dcenter"'
      : "";

    $el.replaceWith(
      `<!-- wp:wsuwp/button {"buttonText":"${text}","buttonUrl":"${href}"${className}} /-->\n`
    );
  });
}

module.exports = { handleButtons };
