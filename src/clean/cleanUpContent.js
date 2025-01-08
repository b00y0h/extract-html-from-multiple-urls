function cleanUpContent($) {
  console.log("🧹 Starting content cleanup...");

  // First, clean up deeply nested divs
  $("div").each(function () {
    const $this = $(this);
    // Only replace divs that don't contain other divs
    if ($this.find("div").length === 0) {
      $this.replaceWith($this.html());
    }
  });

  // Clean up remaining divs from bottom up
  while ($("div").length > 0) {
    $("div").each(function () {
      const $this = $(this);
      if ($this.find("div").length === 0) {
        $this.replaceWith($this.html());
      }
    });
  }

  // Now clean up sections
  $("section").each(function () {
    $(this).replaceWith($(this).html());
  });

  // Finally clean up articles
  $("article").each(function () {
    $(this).replaceWith($(this).html());
  });

  console.log("✨ Content cleanup complete");
}

module.exports = { cleanUpContent };
