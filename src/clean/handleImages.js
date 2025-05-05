function handleImages($, rootUrl) {
  $("img").each((i, el) => {
    // console.log(
    //   "\n🖼️🖼️🖼️🖼️🖼️🖼️🖼️🖼️🖼️🖼️  IMAGE PROCESSING ---------------------"
    // );
    // console.log("📄 Parent HTML context:");
    // console.log($(el).parent().html());

    let src = $(el).attr("src");
    // console.log("🔗 Original src:", src);
    // console.log("🏷️  Alt text:", $(el).attr("alt"));
    // console.log("📝 Parent element:", $(el).parent().prop("tagName"));

    // Log all attributes on the img tag
    const attributes = el.attribs;
    // console.log("🏷️  All image attributes:", attributes);

    const alt = $(el).attr("alt") || "";
    const title = $(el).attr("title") || "";
    const caption = $(el).attr("data-caption") || "";

    // Handle different URL formats
    if (src) {
      // console.log("🔄 Processing image URL:");
      // console.log("  - Original:", src);

      if (src.startsWith("/")) {
        // Relative path starting with /
        src = `${rootUrl}${src}`;
        // console.log("  - Modified (with leading /):", src);
      } else if (!src.startsWith("http")) {
        // Relative path without leading /
        src = `${rootUrl}/${src}`;
        // console.log("  - Modified (without leading /):", src);
      } else {
        // console.log("  - Unchanged (absolute URL):", src);
      }
    }

    let imageBlock = `<!-- wp:image {"sizeSlug":"full","linkDestination":"none"} -->
    <figure class="wp-block-image size-full">
    <img src="${src}" alt="${alt}"`;

    if (title) {
      imageBlock += ` title="${title}"`;
    }

    imageBlock += " />";

    if (caption) {
      imageBlock += `\n<figcaption>${caption}</figcaption>`;
    }

    imageBlock += "\n</figure>\n<!-- /wp:image -->\n";

    // Replace the entire parent <p> tag if it only contains the image
    const $parent = $(el).parent("p");
    // console.log("📝 Parent info:");
    // console.log("  - Has parent <p>:", $parent.length > 0);
    // console.log(
    //   "  - Parent contents length:",
    //   $parent.length ? $parent.contents().length : "N/A"
    // );

    if ($parent.length && $parent.contents().length === 1) {
      // console.log("  - Replacing parent <p> with image block");
      $parent.replaceWith(imageBlock);
    } else {
      // console.log("  - Replacing just the img tag with image block");
      $(el).replaceWith(imageBlock);
    }

    // console.log("🖼️  IMAGE PROCESSING END ---------------------\n");
  });
}

module.exports = { handleImages };
