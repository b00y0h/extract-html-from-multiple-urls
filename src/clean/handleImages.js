const path = require("path");

function handleImages($, rootUrl, mediaResults = []) {
  $("img").each((i, el) => {
    let src = $(el).attr("src");
    const alt = $(el).attr("alt") || "";
    const title = $(el).attr("title") || "";
    const caption = $(el).attr("data-caption") || "";

    if (src) {
      // Skip SVG images completely
      if (
        src.toLowerCase().endsWith(".svg") ||
        src.toLowerCase().includes(".svg?")
      ) {
        console.log(`⏩ Skipping SVG image: ${src}`);
        $(el).remove();
        return;
      }

      // Handle different URL formats
      if (src.startsWith("/")) {
        src = `${rootUrl}${src}`;
      } else if (!src.startsWith("http")) {
        src = `${rootUrl}/${src}`;
      }

      // Decode and clean up the source URL for comparison
      const cleanSrc = decodeURIComponent(src).replace(/\s+/g, "-");
      const basename = path.basename(cleanSrc);

      // Look for matching media result
      const mediaItem = mediaResults.find((item) => {
        if (!item?.originalUrl) return false;
        const cleanOriginal = decodeURIComponent(item.originalUrl).replace(
          /\s+/g,
          "-"
        );
        const cleanNew = decodeURIComponent(item.wordpressUrl).replace(
          /\s+/g,
          "-"
        );

        // Check if either the original URL or WordPress URL contains the basename
        return cleanOriginal.includes(basename) || cleanNew.includes(basename);
      });

      if (mediaItem?.wordpressUrl && mediaItem?.id) {
        // Start building the image block
        let blockAttributes = {
          id: mediaItem.id,
          sizeSlug: "full",
          linkDestination: "none",
        };

        // Create block with attributes
        let imageBlock = `<!-- wp:image ${JSON.stringify(blockAttributes)} -->
<figure class="wp-block-image size-full"><img src="${
          mediaItem.wordpressUrl
        }" alt="${alt}"`;

        // Add title if present
        if (title) {
          imageBlock += ` title="${title}"`;
        }

        // Close img tag and figure
        imageBlock += "/></figure>\n<!-- /wp:image -->";

        // Replace the original img tag with the WordPress block
        $(el).replaceWith(imageBlock);
        console.log(`✅ Replaced image ${basename} with WordPress block`);
      } else {
        console.log(
          `⚠️ No WordPress media found for image: ${basename} - Skipping image`
        );
        $(el).remove();
      }
    }
  });
}

module.exports = { handleImages };
