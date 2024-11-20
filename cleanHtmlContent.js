const cheerio = require("cheerio");

// Extract the root URL (protocol and host) from a given URL
function getRootUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.protocol}//${parsedUrl.host}`;
  } catch (error) {
    console.error("Invalid URL:", error);
    return null;
  }
}

// Clean and transform HTML content for further processing
function cleanHtmlContent(contentHtml, url) {
  const $ = cheerio.load(contentHtml);
  const rootUrl = getRootUrl(url);

  // Remove specific <a> tags
  $("a#main-content").remove();
  $('a[href="#main-content"]:contains("Back to top")').remove();

  // Remove empty <p> tags
  $("p:empty").remove();

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
    const transformedContent = transformContentToWpBlocks($.html(el));
    $(el).replaceWith(transformedContent);
  });

  // Remove <article>, <section>, and <div> tags
  $("article, section, div").each((i, el) => {
    $(el).replaceWith($(el).html());
  });

  // Handle <iframe> tags
  $("iframe").each((i, el) => {
    const src = $(el).attr("src");
    if (!src.includes("https://www.youtube.com/embed")) {
      $(el).replaceWith(
        `<h1>🫥🫥<br />iFrame found and needs updating: <br />${src}<br />🫥🫥🫥</h1>`
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

  // Wrap <p> tags in WordPress paragraph blocks
  $("p").each((i, el) => {
    const text = $(el).html().trim();
    if (text) {
      $(el).replaceWith(
        `<!-- wp:paragraph -->\n<p>${text}</p>\n<!-- /wp:paragraph -->\n`
      );
    }
  });

  // Prepend root URL to <img> src paths
  $("img").each((i, el) => {
    const src = $(el).attr("src");
    if (src.startsWith("/")) {
      $(el).attr("src", `${rootUrl}${src}`);
    }
  });

  // Handle <form> tags
  $("form").each((i, el) => {
    const action = $(el).attr("action");
    $(el).replaceWith(
      `<h1>🚨🚨🚨<br />Form found and needs updating: <br />${action}<br />🚨🚨🚨</h1>`
    );
  });

  // Wrap <h1> to <h6> tags in WordPress heading blocks
  $("h1, h2, h3, h4, h5, h6").each((i, el) => {
    const level = el.tagName.charAt(1);
    const text = $(el).html().trim();
    $(el).replaceWith(
      `<!-- wp:heading {"level":${level}} -->\n<h${level} class="wp-block-heading">${text}</h${level}>\n<!-- /wp:heading -->\n`
    );
  });

  // Wrap <ul> and <li> tags in WordPress list blocks
  $("ul").each((i, el) => {
    $(el).before("<!-- wp:list -->\n").after("\n<!-- /wp:list -->");
  });
  $("li").each((i, el) => {
    $(el).before("<!-- wp:list-item -->\n").after("\n<!-- /wp:list-item -->");
  });

  // Wrap <table> tags in WordPress table blocks
  $("table").each((i, el) => {
    $(el)
      .before('<!-- wp:table -->\n<figure class="wp-block-table">\n')
      .after("\n</figure>\n<!-- /wp:table -->");
  });

  // Adjust <td> tags and <caption> in tables
  $('td[scope="row"]').removeAttr("scope");
  $("caption").each((i, el) => {
    const text = $(el).html().trim();
    $(el).replaceWith(
      `<figcaption class="wp-element-caption">${text}</figcaption>`
    );
  });

  // Ensure <figcaption> is placed correctly after <table>
  $("table").each((i, el) => {
    const figcaption = $(el).siblings("figcaption");
    if (figcaption.length) {
      $(el).after(figcaption);
    }
  });

  // Select all <div> and <article> elements and replace them with their inner HTML
  $("article").each((i, el) => {
    const innerContent = $(el).html(); // Get the inner HTML of the element
    $(el).replaceWith(innerContent); // Replace the element with its content
  });
  $("div")
    .toArray()
    .forEach((el) => {
      const innerContent = $(el).html(); // Get the inner HTML of the element
      $(el).replaceWith(innerContent); // Replace the element with its content
    });

  // Return the cleaned HTML
  return $.html()
    .replace(/^\s*[\r\n]/gm, "")
    .replace(/^\s+/gm, "");
}

module.exports = cleanHtmlContent;
