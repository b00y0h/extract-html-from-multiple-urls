function handleIframes($) {
  $("iframe").each((i, el) => {
    const src = $(el).attr("src");
    if (!src || !src.includes("https://www.youtube.com/embed")) {
      $(el).replaceWith(
        `<h2>🫥🫥<br />iFrame found and needs updating: <br />${
          src || "no src"
        }<br />🫥🫥🫥</h2>`
      );
    }
  });
}

module.exports = { handleIframes };
