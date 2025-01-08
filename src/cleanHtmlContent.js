require("dotenv").config();
const cheerio = require("cheerio");

async function transformToWPBlocks(contentHtml, originalUrl) {
  console.log("\n🔄 TRANSFORM START ---------------------");
  console.log("🌐 Original URL:", originalUrl);

  try {
    const $ = cheerio.load(contentHtml);
    console.log("✅ Content loaded into cheerio");

    const rootUrl = getRootUrl(originalUrl);
    console.log("🌍 Root URL:", rootUrl);

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

    // Transform specific <div> to WordPress blocks
    $("div.paragraph.paragraph--type--bp-columns").each((i, el) => {
      const transformedContent = transformColumnsToWpBlocks($.html(el));
      $(el).replaceWith(transformedContent);
    });

    // Handle images with proper URL resolution
    $("img").each((i, el) => {
      let src = $(el).attr("src");
      const alt = $(el).attr("alt") || "";
      const title = $(el).attr("title") || "";
      const caption = $(el).attr("data-caption") || "";

      // Handle different URL formats
      if (src) {
        if (src.startsWith("/")) {
          // Relative path starting with /
          src = `https://studentaffairs.vancouver.wsu.edu${src}`;
        } else if (!src.startsWith("http")) {
          // Relative path without leading /
          src = `https://studentaffairs.vancouver.wsu.edu/${src}`;
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
      if ($parent.length && $parent.contents().length === 1) {
        $parent.replaceWith(imageBlock);
      } else {
        $(el).replaceWith(imageBlock);
      }
    });

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

    // Remove <article>, <section>, and <div> tags but keep their content
    $("article, section, div").each((i, el) => {
      $(el).replaceWith($(el).html());
    });

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

// Clean and transform HTML content for further processing
async function transformToWPBlocks(contentHtml, originalUrl) {
  console.log("\n🔄 TRANSFORM START ---------------------");
  console.log("🌐 Original URL:", originalUrl);

  try {
    const $ = cheerio.load(contentHtml);
    console.log("✅ Content loaded into cheerio");

    const rootUrl = getRootUrl(originalUrl);
    console.log("🌍 Root URL:", rootUrl);

    if (!rootUrl) {
      throw new Error(`Invalid root URL derived from: ${originalUrl}`);
    }

    // Log initial content structure
    console.log("📄 Initial content structure:");
    console.log(contentHtml.substring(0, 500) + "...");

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

    // Process each HTML element type with error handling
    try {
      // Remove specific <a> tags
      $("a#main-content").remove();
      $('a[href="#main-content"]:contains("Back to top")').remove();
      console.log("✅ Removed specific <a> tags");

      // Remove empty <div> tags
      $("div:empty").remove();
      console.log("✅ Removed empty divs");

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
      console.log("✅ Processed iframes");

      // Continue with other transformations...
      // Add similar error handling and logging for each section

      // Log final content before returning
      const finalContent = $("body")
        .html()
        .replace(/^\s*[\r\n]/gm, "")
        .replace(/^\s+/gm, "");

      console.log("📄 Final content preview:");
      console.log(finalContent.substring(0, 500) + "...");
      console.log("🔄 TRANSFORM END ---------------------\n");

      return Promise.resolve(finalContent);
    } catch (error) {
      console.error("❌ Error during HTML transformations:", error);
      throw error;
    }
  } catch (error) {
    console.error("💥 Fatal error in transformToWPBlocks:", error);
    console.log("🔄 TRANSFORM END (WITH ERROR) ---------------------\n");
    throw error;
  }
}

module.exports = { transformToWPBlocks };
