const fs = require("fs");
const readline = require("readline");
const axios = require("axios");
const cheerio = require("cheerio");
const https = require("https");
const path = require("path");

// Constants
const ERROR_URL_FILE = "error_url.txt";
const LOG_FILE = "crawling_log.txt";
const CONCURRENCY_LIMIT = 5; // Adjust concurrency limit if needed
const CRAWL_DELAY_MS = 0; // 2 seconds delay between requests
const USER_AGENT =
  "EAB Crawler/1.0 (https://agency.eab.com/; bobsmith@eab.com)";

// Function to log messages to a file
function logMessage(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
}

function transformContentToWpBlocks(content) {
  // console.log("⭐⭐⭐ ~ transformContentToWpBlocks ~ content:", content);
  const $ = cheerio.load(content);

  // Select the direct child divs within the paragraph__column
  const childDivs = $(".paragraph__column > div");

  // Array to hold each column's content
  let columns = [];

  // Iterate over each child div and store its HTML content
  childDivs.each((i, childDiv) => {
    columns.push($(childDiv).html().trim());
  });
  // console.log(
  //   "🚀🚀🚀🚀 ~ transformContentToWpBlocks ~ columns:",
  //   columns.length
  // );

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
      layout = "auto"; // Default or custom logic for other numbers
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

// Create directories based on the URL path
function createDirectoriesFromUrl(url) {
  const parsedUrl = new URL(url);
  const domainFolder = parsedUrl.hostname;
  const directoryPath = path.join(
    __dirname,
    "dist",
    domainFolder,
    parsedUrl.pathname
  );
  fs.mkdirSync(directoryPath, { recursive: true });
  return directoryPath;
}

// Sanitize the file name by removing unwanted characters
function sanitizeFileName(url) {
  return url.replace(/^https?:\/\//, "").replace(/[^\w.-]+/g, "_");
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

// Process the content of a URL and save it to a file
async function processContent(contentResponse, url, currentUrl, totalUrls) {
  const $ = cheerio.load(contentResponse.data);
  const sections = $('div[role="main"] > div.row > section')
    .map((i, el) => $(el).html())
    .get();

  if (sections.length) {
    const contentHtml = sections.join("\n");
    const cleanedContent = cleanHtmlContent(contentHtml, url);
    const directoryPath = createDirectoriesFromUrl(url);
    const sanitizedFileName = sanitizeFileName(url) + ".txt";
    const filePath = path.join(directoryPath, sanitizedFileName);
    fs.writeFileSync(filePath, cleanedContent);
    console.log(`Finished: ${currentUrl} of ${totalUrls}: ✅ : ${url}`);
    logMessage(
      `Successfully processed: ${url} - Status: ${contentResponse.status}`
    );
  } else {
    console.log(
      `Finished: ${currentUrl} of ${totalUrls}: ❌ (No section found): ${url}`
    );
    logMessage(
      `No section found for: ${url} - Status: ${contentResponse.status}`
    );
  }
}

// Fetch and process a single URL
async function fetchUrl(url, currentUrl, totalUrls) {
  try {
    // Perform a HEAD request to check the URL status
    const headResponse = await axios.head(url, {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      validateStatus: (status) => status < 500,
      headers: { "User-Agent": USER_AGENT },
    });

    // Determine the target URL, following redirects if necessary
    const targetUrl =
      headResponse.status === 301 ? headResponse.headers.location : url;

    // Perform a GET request to fetch the content
    const contentResponse = await axios.get(targetUrl, {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });

    // Process the fetched content
    await processContent(contentResponse, url, currentUrl, totalUrls);
  } catch (error) {
    // Log errors and append to the error file
    fs.appendFileSync(ERROR_URL_FILE, `${error.message}: ${url}\n`);
    console.error(`❌ Error processing URL ${url}: ${error.message}`);
    logMessage(`Error processing URL ${url}: ${error.message}`);

    if (error.response) {
      // console.error(`Response data: ${error.response.data}`);
      console.error(`📉 Response status: ${error.response.status}`);
      logMessage(
        `Error response for URL ${url}: Status: ${error.response.status}`
      );

      // console.error(
      //   `🔍 Response headers: ${JSON.stringify(error.response.headers)}`
      // );
    }
  }
}

// Main function to process URLs from an input file
async function checkUrls() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error("Usage: node index.js <file_with_urls>");
    process.exit(1);
  }

  // Clear the error file
  fs.writeFileSync(ERROR_URL_FILE, "");

  // Read URLs from the input file
  const fileStream = fs.createReadStream(inputFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const urls = [];
  for await (const line of rl) {
    urls.push(line.trim()); // Trim whitespace to avoid processing empty lines
  }

  let currentUrl = 0;
  const totalUrls = urls.length;

  // Capture the start time
  const startTime = new Date();

  // Process URLs with a limited number of concurrent requests
  const processQueue = async () => {
    if (urls.length === 0) return;

    const activeRequests = [];
    while (activeRequests.length < CONCURRENCY_LIMIT && urls.length > 0) {
      const url = urls.shift();
      activeRequests.push(
        fetchUrl(url, ++currentUrl, totalUrls).finally(() => {
          const index = activeRequests.indexOf(url);
          if (index > -1) activeRequests.splice(index, 1);
        })
      );
      await new Promise((resolve) => setTimeout(resolve, CRAWL_DELAY_MS)); // Delay between requests
    }
    await Promise.all(activeRequests);
    await processQueue();
  };

  await processQueue();

  // Capture the end time
  const endTime = new Date();

  console.log("All URLs have been processed.");

  // Calculate the elapsed time
  const elapsedTimeMs = endTime - startTime;
  const elapsedMinutes = Math.floor(elapsedTimeMs / 60000); // 1 minute = 60000 ms
  const elapsedSeconds = Math.floor((elapsedTimeMs % 60000) / 1000); // Remaining seconds

  // Generate a report of the results
  const withErrorUrlCount = fs
    .readFileSync(ERROR_URL_FILE, "utf-8")
    .split("\n")
    .filter(Boolean).length;
  console.log("\nReport generated:");
  console.log(`Total URLs processed: ${totalUrls}`);
  console.log(`URLs with Error: ${withErrorUrlCount}`);
  // Conditionally format the elapsed time
  if (elapsedMinutes > 0) {
    console.log(
      `Total processing time: ${elapsedMinutes} minutes, ${elapsedSeconds} seconds`
    );
  } else {
    console.log(`Total processing time: ${elapsedSeconds} seconds`);
  }

  console.log("---------------------------------");
}

// Start the URL checking process
checkUrls();
