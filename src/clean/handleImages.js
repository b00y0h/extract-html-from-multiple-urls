const path = require("path");

// Flag to track if we've processed any images successfully
let processedImages = false;

function handleImages($, rootUrl, mediaResults = []) {
  console.log(`\n🔍 HANDLE IMAGES START ---------------------`);
  console.log(`Found ${$("img").length} images to process`);
  console.log(`Media results available: ${mediaResults.length}`);

  // Reset the processed flag
  processedImages = false;

  // Store processed image data for emergency fallback
  const processedImageData = [];

  $("img").each((i, el) => {
    let src = $(el).attr("src");
    const alt = $(el).attr("alt") || "";
    const title = $(el).attr("title") || "";
    const caption = $(el).attr("data-caption") || "";

    console.log(`\n📷 Processing image ${i + 1}/${$("img").length}: ${src}`);

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
      console.log(`🔎 Looking for match for basename: ${basename}`);

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
        const isMatch =
          cleanOriginal.includes(basename) || cleanNew.includes(basename);
        if (isMatch) {
          console.log(`✅ Found matching media item:
            - ID: ${item.id}
            - Original URL: ${item.originalUrl}
            - WordPress URL: ${item.wordpressUrl}`);
        }
        return isMatch;
      });

      if (mediaItem?.wordpressUrl && mediaItem?.id) {
        console.log(
          `📝 Building WordPress image block for ID: ${mediaItem.id}`
        );
        // Start building the image block
        let blockAttributes = {
          id: mediaItem.id,
          sizeSlug: "full",
          linkDestination: "none",
        };

        // Create a properly formatted WordPress image block
        let imageBlock = `<!-- wp:image ${JSON.stringify(
          blockAttributes
        )} -->\n<figure class=\"wp-block-image size-full\"><img src=\"${
          mediaItem.wordpressUrl
        }" alt="${alt}" class="wp-image-${mediaItem.id}"`;

        // Add title if present
        if (title) {
          imageBlock += ` title=\"${title}\"`;
        }

        // Close img tag and figure - ensuring they stay together
        imageBlock += `/></figure>\n<!-- /wp:image -->`;

        console.log(`📄 Generated WordPress block:\n${imageBlock}`);

        // Store the image data for emergency fallback
        processedImageData.push({
          id: mediaItem.id,
          url: mediaItem.wordpressUrl,
          alt: alt,
          title: title,
          block: imageBlock,
        });

        // Replace the parent <p> if the <img> is the only child, otherwise just replace the <img>
        const $parent = $(el).parent();
        if ($parent.is("p")) {
          const nonImageContent = $parent.contents().filter(function() {
            return this.type === 'text' && this.data.trim().length > 0;
          }).text().trim();

          if ($parent.contents().length === 1 && $parent.children("img").length === 1) {
            // If there's only an image in the paragraph, replace the whole paragraph
            $parent.replaceWith(imageBlock);
          } else {
            // If there's text content, replace the image and preserve the text
            $(el).replaceWith(imageBlock);
            if (nonImageContent) {
              // Insert text content after the image block
              $(imageBlock).after(`\n<p>${nonImageContent}</p>\n`);
              $parent.remove(); // Remove the original paragraph
            }
          }
        } else {
          $(el).replaceWith(imageBlock);
        }

        console.log(`✅ Image ${basename} processed`);
      } else {
        console.log(
          `⚠️ No WordPress media found for image: ${basename} - Skipping image`
        );
        $(el).remove();
      }
    }
  });

  // Store processed image data for use in cleanHtmlContent.js
  $.processedImageData = processedImageData;

  // Report on processing results
  if (processedImages) {
    console.log(
      `✅ Successfully processed ${processedImageData.length} images directly`
    );
  } else if (processedImageData.length > 0) {
    console.log(
      `⚠️ Created ${processedImageData.length} image blocks but direct insertion may have failed`
    );
  } else {
    console.log(`ℹ️ No images were processed`);
  }

  console.log(`🔍 HANDLE IMAGES END ---------------------\n`);
}

// Export the function and a flag indicating if we've processed images
module.exports = {
  handleImages,
  hasProcessedImages: () => processedImages,
};
