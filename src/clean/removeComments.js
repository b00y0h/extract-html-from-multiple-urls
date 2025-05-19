function removeComments($) {
  try {
    $("*").each(function () {
      const $this = $(this);
      $this
        .contents()
        .filter(function () {
          return this.type === "comment";
        })
        .remove();
    });
    console.log("✅ Removed all HTML comments");
  } catch (error) {
    console.error("❌ Error removing comments:", error.message);
  }
}

module.exports = { removeComments };
