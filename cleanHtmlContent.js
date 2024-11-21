require("dotenv").config();
const cheerio = require("cheerio");

const wpConfig = {
  endpoint: process.env.WP_API_BASE_URL,
  username: process.env.WP_API_USERNAME,
  password: process.env.WP_API_USERNAME,
};
function transformColumnsToWpBlocks(content) {
  // console.log("⭐��⭐ ~ transformColumnsToWpBlocks ~ content:", content);
  const $ = cheerio.load(content);

  // Select the direct child divs within the paragraph__column that have a class containing "bp-columns"
  const childDivs = $(".paragraph__column > div[class*='bp-columns']");

  // Array to hold each column's content
  let columns = [];

  // Iterate over each child div and store its HTML content
  childDivs.each((i, childDiv) => {
    columns.push($(childDiv).html().trim());
  });

  // if columns.length is 0 then return null
  if (columns.length === 0) {
    return null;
  }

  // Determine the layout based on the number of columns
  let layout;
  switch (columns.length) {
    case 2:
      layout = "halves";
      break;
    case 3:
      layout = "thirds";
      break;
    case 4:
      layout = "quarters";
      break;
    default:
      // Return the childDivs directly for the default case
      return childDivs.map((i, el) => $(el).html().trim()).get();
  }

  // Start building the output
  let output = `<!-- wp:wsuwp/row {"layout":"${layout}"} -->\n`;

  // Add each column to the output
  columns.forEach((column) => {
    output += `<!-- wp:wsuwp/column -->\n${column}\n<!-- /wp:wsuwp/column -->\n`;
  });

  // Close the row block
  output += `<!-- /wp:wsuwp/row -->`;
  return output;
}

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
async function transformToWPBlocks(contentHtml, url) {
  const $ = cheerio.load(contentHtml);
  const rootUrl = getRootUrl(url);

  // Remove commented-out content
  $("*").each(function () {
    const $this = $(this);

    // Find and remove comments that contain HTML-like structures
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

  // Remove specific <a> tags
  $("a#main-content").remove();
  $('a[href="#main-content"]:contains("Back to top")').remove();

  // Remove empty <p> tags
  // $("p:empty").remove();
  // Remove empty <div> tags
  $("div:empty").remove();

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

  // Wrap <p> tags in WordPress paragraph blocks
  // and clean up empty paragraphs
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
      if (
        $this
          .text()
          .includes(
            "The Student Wellness Center provides free, confidential counseling"
          )
      ) {
        console.log("found the2: The Student Wellness: content");
      }
      // Remove empty or whitespace-only paragraphs
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

  // Prepend root URL to <img> src paths and upload images to WordPress
  const imgElements = $("img").toArray();
  await Promise.all(
    imgElements.map(async (imgElement) => {
      const img = $(imgElement);
      let src = img.attr("src");

      // Check if src is a relative URL and update it
      if (src.startsWith("/")) {
        src = `${rootUrl}${src}`;
        img.attr("src", src);
      }

      const alt = img.attr("alt") || "";

      // Create the new HTML structure
      const wrappedImage = `
<!-- wp:image -->
<figure class="wp-block-image"><img src="${img.attr(
        "src"
      )}" alt="${alt}"/></figure>
<!-- /wp:image -->
`;

      // Replace the img tag with the new structure
      img.replaceWith(wrappedImage);
    })
  );

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
    const $table = $(el);
    const $caption = $table.find("caption");
    let captionText = "";
    // remove any classes on the table
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

  // Adjust <td> tags and <caption> in tables
  $('td[scope="row"]').removeAttr("scope");

  // Select all <div> and <article> elements and replace them with their inner HTML
  $("article").each((i, el) => {
    const innerContent = $(el).html(); // Get the inner HTML of the element
    $(el).replaceWith(innerContent); // Replace the element with its content
  });
  // Find all divs and replace them with their contents
  $("div").each(function () {
    $(this).replaceWith($(this).contents());
  });

  // find all <hr> and replace them with a separator block
  $("hr").each(function () {
    const replacedHTML = `
        <!-- wp:separator -->
        <hr class="wp-block-separator has-alpha-channel-opacity"/>
        <!-- /wp:separator -->
        `;
    $(this).replaceWith(replacedHTML);
  });

  // Return the cleaned HTML
  return Promise.resolve(
    $("body")
      .html()
      .replace(/^\s*[\r\n]/gm, "")
      .replace(/^\s+/gm, "")
  );
}

module.exports = { transformToWPBlocks };
