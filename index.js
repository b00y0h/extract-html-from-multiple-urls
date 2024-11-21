const fs = require("fs");
const readline = require("readline");
const axios = require("axios");
const cheerio = require("cheerio");
const https = require("https");
const path = require("path");
const {
  postToWordPress,
  updateParentPage,
  getParentPageSlug,
} = require("./postToWordpress");
const { transformToWPBlocks } = require("./cleanHtmlContent");

// Load environment variables from a .env file if present
require("dotenv").config();

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
  // console.log("⭐��⭐ ~ transformContentToWpBlocks ~ content:", content);
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

async function processContent(contentResponse, url, currentUrl, totalUrls) {
  const $ = cheerio.load(contentResponse.data);
  const sections = $('div[role="main"] > div.row > section')
    .map((i, el) => $(el).html())
    .get();
  let imageUrls = [];

  if (sections.length) {
    // join the sections
    const contentHtml = sections.join("\n");

    // transform the content to WP blocks
    const transformedToWPContent = await transformToWPBlocks(contentHtml, url);

    const content$ = cheerio.load(transformedToWPContent);

    // grab all the image urls out of the contentHtml
    content$("img").each((i, el) => {
      const imageUrl = content$(el).attr("src");
      const imageAlt = content$(el).attr("alt");
      if (imageUrl) {
        imageUrls.push({ url: imageUrl, alt: imageAlt });
      }
    });

    // Save the content to a file
    const directoryPath = createDirectoriesFromUrl(url);
    const sanitizedFileName = sanitizeFileName(url) + ".txt";
    const filePath = path.join(directoryPath, sanitizedFileName);
    fs.writeFileSync(filePath, transformedToWPContent);
    console.log(`Finished: ${currentUrl} of ${totalUrls}: ✅ : ${url}`);
    logMessage(
      `Successfully processed: ${url} - Status: ${contentResponse.status}`
    );

    // Extract the page title and get text up until the first `-`
    let pageTitle = $("title").text().trim();
    if (pageTitle.includes(" - ")) {
      pageTitle = pageTitle.split(" - ")[0].trim();
    }
    pageTitle = pageTitle || `Page ${currentUrl}`;

    // Extract the page meta description
    const metaDescription = $('meta[name="description"]').attr("content");

    const slug = url.split("/").pop();

    const post = {
      title: pageTitle,
      content: transformedToWPContent,
      status: "publish",
      meta: {
        description: metaDescription,
      },
      slug: slug,
      images: imageUrls,
    };

    // let pageId = null;
    // Post the content to the WordPress API
    const pageId = await postToWordPress(post);

    return { url, pageId };
  } else {
    console.log(
      `Finished: ${currentUrl} of ${totalUrls}: ❌ (No section found): ${url}`
    );
    logMessage(
      `No section found for: ${url} - Status: ${contentResponse.status}`
    );
    return { url, pageId: null };
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
    return await processContent(contentResponse, url, currentUrl, totalUrls);
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
    }
    return { url, pageId: null };
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
  const results = [];
  const processQueue = async () => {
    if (urls.length === 0) return;

    const activeRequests = [];
    while (activeRequests.length < CONCURRENCY_LIMIT && urls.length > 0) {
      const url = urls.shift();
      activeRequests.push(
        fetchUrl(url, ++currentUrl, totalUrls)
          .then((result) => results.push(result))
          .finally(() => {
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

  // Set parent pages after all pages have been posted
  for (const result of results) {
    if (result.pageId) {
      const parentPageSlug = getParentPageSlug(result.url);
      if (parentPageSlug) {
        const parentResult = results.find((r) =>
          r.url.includes(parentPageSlug)
        );
        if (parentResult && parentResult.pageId) {
          await updateParentPage(result.pageId, parentResult.pageId);
        }
      }
    }
  }

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
