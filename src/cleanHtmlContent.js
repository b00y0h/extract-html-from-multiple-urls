require("dotenv").config();
const cheerio = require("cheerio");

async function transformToWPBlocks(contentHtml, originalUrl) {
  console.log("\n🔄 TRANSFORM START ---------------------");
  console.log("🌐 Original URL:", originalUrl);

  try {
    const $ = cheerio.load(contentHtml);
    console.log("✅ Content loaded into cheerio");
    console.log("📊 Initial content stats:");
    console.log("- Total elements:", $("*").length);
    console.log("- Images found:", $("img").length);
    console.log(
      "- Main content area:",
      $('div[role="main"]').length ? "Found" : "Not found"
    );
    console.log("- Sections found:", $("section").length);

    const rootUrl = getRootUrl(originalUrl);

    if (!rootUrl) {
      throw new Error(`Invalid root URL derived from: ${originalUrl}`);
    }

    // Remove commented-out content
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

    // Remove specific <a> tags
    $("a#main-content").remove();
    $('a[href="#main-content"]:contains("Back to top")').remove();

    // Remove empty <div> tags
    $("div:empty").remove();

    // Remove <style> tags
    $("style").remove();

    // Remove <br> tags
    $("br").remove();

    // Handle <iframe> tags
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

    // Replace <span> tags but keep their content
    $("span").each((i, el) => {
      $(el).replaceWith($(el).html());
    });

    // Wrap video container content in <p>
    $("div.video-container").each((i, el) => {
      $(el).replaceWith(`<p>${$(el).html().trim()}</p>`);
    });

    console.log("\n🔍 PRE-IMAGE PROCESSING ---------------------");
    console.log("Found images:", $("img").length);
    // console.log("First 500 chars of content:");
    // console.log($.html().substring(0, 500));
    console.log("All img tags found:");
    $("img").each((i, el) => {
      console.log(`Image ${i + 1}:`, $.html(el));
    });
    console.log("🔍 PRE-IMAGE PROCESSING END ---------------------\n");

    // Handle images with proper URL resolution
    $("img").each((i, el) => {
      console.log(
        "\n🖼️🖼️🖼️🖼️🖼️🖼️🖼️🖼️🖼️🖼️  IMAGE PROCESSING ---------------------"
      );
      console.log("📄 Parent HTML context:");
      console.log($(el).parent().html());

      let src = $(el).attr("src");
      console.log("🔗 Original src:", src);
      console.log("🏷️  Alt text:", $(el).attr("alt"));
      console.log("📝 Parent element:", $(el).parent().prop("tagName"));

      // Log all attributes on the img tag
      const attributes = el.attribs;
      console.log("🏷️  All image attributes:", attributes);

      const alt = $(el).attr("alt") || "";
      const title = $(el).attr("title") || "";
      const caption = $(el).attr("data-caption") || "";

      // Handle different URL formats
      if (src) {
        console.log("🔄 Processing image URL:");
        console.log("  - Original:", src);

        if (src.startsWith("/")) {
          // Relative path starting with /
          src = `${rootUrl}${src}`;
          console.log("  - Modified (with leading /):", src);
        } else if (!src.startsWith("http")) {
          // Relative path without leading /
          src = `${rootUrl}/${src}`;
          console.log("  - Modified (without leading /):", src);
        } else {
          console.log("  - Unchanged (absolute URL):", src);
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

      console.log("📦 Generated image block:");
      console.log(imageBlock);

      // Replace the entire parent <p> tag if it only contains the image
      const $parent = $(el).parent("p");
      console.log("📝 Parent info:");
      console.log("  - Has parent <p>:", $parent.length > 0);
      console.log(
        "  - Parent contents length:",
        $parent.length ? $parent.contents().length : "N/A"
      );

      if ($parent.length && $parent.contents().length === 1) {
        console.log("  - Replacing parent <p> with image block");
        $parent.replaceWith(imageBlock);
      } else {
        console.log("  - Replacing just the img tag with image block");
        $(el).replaceWith(imageBlock);
      }

      console.log("🖼️  IMAGE PROCESSING END ---------------------\n");
    });
    // Add this after the image processing section
    console.log("\n🔍 POST-IMAGE PROCESSING ---------------------");
    console.log("Remaining images:", $("img").length);
    console.log("🔍 POST-IMAGE PROCESSING END ---------------------\n");

    // Handle blockquotes
    $("blockquote").each(function () {
      const content = $(this).html();
      $(this).replaceWith(
        `<!-- wp:quote -->
        <blockquote class="wp-block-quote">
        <!-- wp:paragraph -->
        <p>${content}</p>
        <!-- /wp:paragraph -->
        </blockquote>
        <!-- /wp:quote -->`
      );
    });

    // With this more detailed cleanup:
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

    // Handle paragraphs
    $("p").each(function () {
      const $this = $(this);

      // Check if paragraph contains only anchor tags with btn-default class
      if (
        $this.children("a.btn-default").length > 0 &&
        $this.children("a.btn-default").length === $this.children().length
      ) {
        // Replace the paragraph with just its anchor tags
        $this.replaceWith($this.html());
      } else if ($this.text().trim() === "") {
        // Remove empty paragraphs
        $this.remove();
      } else {
        // Replace non-empty paragraphs with the desired format
        $this.replaceWith(
          `<!-- wp:paragraph -->\n<p>${$this.html()}</p>\n<!-- /wp:paragraph -->\n`
        );
      }
    });

    // Convert <a> tags with class 'btn' to WordPress button blocks
    $("a.btn").each((i, el) => {
      const href = $(el).attr("href");
      const text = $(el).text().trim();
      $(el).replaceWith(
        `<!-- wp:wsuwp/button {"buttonText":"${text}","buttonUrl":"${href}"} /-->\n`
      );
    });

    // Handle <form> tags
    $("form").each((i, el) => {
      const action = $(el).attr("action");
      $(el).replaceWith(
        `<h2>🚨🚨🚨<br />Form found and needs updating: <br />${action}<br />${rootUrl}<br />🚨🚨🚨</h2>`
      );
    });

    // Handle headings
    $("h1, h2, h3, h4, h5, h6").each((i, el) => {
      const level = el.tagName.charAt(1);
      const text = $(el).html().trim();
      $(el).replaceWith(
        `<!-- wp:heading {"level":${level}} -->\n<h${level} class="wp-block-heading">${text}</h${level}>\n<!-- /wp:heading -->\n`
      );
    });

    // Handle lists
    $("ul").each((i, el) => {
      $(el).before("<!-- wp:list -->\n").after("\n<!-- /wp:list -->");
    });
    $("li").each((i, el) => {
      $(el).before("<!-- wp:list-item -->\n").after("\n<!-- /wp:list-item -->");
    });

    // Handle tables
    $("table").each((i, el) => {
      const $table = $(el);
      const $caption = $table.find("caption");
      let captionText = "";
      $table.removeAttr("class");

      if ($caption.length) {
        captionText = $caption.text().trim();
        $caption.remove();
      }

      $table.wrap('<figure class="wp-block-table"></figure>');
      if (captionText) {
        $table.after(
          `\n<figcaption class="wp-element-caption">${captionText}</figcaption>`
        );
      }

      $table.parent().before("<!-- wp:table -->");
      $table.parent().after("<!-- /wp:table -->");
    });

    // Clean up table attributes
    $('td[scope="row"]').removeAttr("scope");

    // Handle horizontal rules
    $("hr").each(function () {
      $(this).replaceWith(`
        <!-- wp:separator -->
        <hr class="wp-block-separator has-alpha-channel-opacity"/>
        <!-- /wp:separator -->
      `);
    });

    // Final cleanup and return
    const finalContent = $("body")
      .html()
      .replace(/^\s*[\r\n]/gm, "")
      .replace(/^\s+/gm, "");

    console.log("✅ Content transformation complete");
    console.log("🔄 TRANSFORM END ---------------------\n");

    return Promise.resolve(finalContent);
  } catch (error) {
    console.error("💥 Error in transformToWPBlocks:", error);
    console.log("🔄 TRANSFORM END (WITH ERROR) ---------------------\n");
    throw error;
  }
}

function ensureUrlProtocol(url) {
  if (!/^https?:\/\//i.test(url)) {
    return `https://${url}`;
  }
  return url;
}

// Extract the root URL (protocol and host) from a given URL
function getRootUrl(url) {
  try {
    url = ensureUrlProtocol(url);
    const parsedUrl = new URL(url);
    return `${parsedUrl.protocol}//${parsedUrl.host}`;
  } catch (error) {
    console.error("Invalid URL:", error, "Input URL:", url);
    return null;
  }
}

module.exports = { transformToWPBlocks };
