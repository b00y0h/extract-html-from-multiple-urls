function removeComments($) {
  try {
    $("*").each(function () {
      const $this = $(this);
      $this
        .contents()
        .filter(function () {
          return (
            this.type === "comment" &&
            this.data.includes("<") &&
            this.data.includes(">")
          );
        })
        .remove();
    });
    console.log("✅ Removed commented content");
  } catch (error) {
    console.error("❌ Error removing comments:", error.message);
  }
}

module.exports = { removeComments };
