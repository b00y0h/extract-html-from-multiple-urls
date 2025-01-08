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
  findPageBySlug,
} = require("./src/postToWordpress");
const { transformToWPBlocks } = require("./src/cleanHtmlContent");
const {
  getAuthToken,
  getUrlsFromSheet,
  updateSheetWithTimestamp,
} = require("./src/updateGoogleSheet");

// Load environment variables from a .env file if present
require("dotenv").config();

// Constants
const ERROR_URL_FILE = "error_url.txt";
const LOG_FILE = "crawling_log.txt";
const CONCURRENCY_LIMIT = 5; // Adjust concurrency limit if needed
const CRAWL_DELAY_MS = 0; // 2 seconds delay between requests
const USER_AGENT =
  "EAB Crawler/1.0 (https://agency.eab.com/; bobsmith@eab.com)";
const URL_PROCESS_LIMIT = 10; // Limit the number of URLs to process

// Function to log messages to a file
function logMessage(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
}

function ensureUrlProtocol(url) {
  if (!/^https?:\/\//i.test(url)) {
    return `https://${url}`;
  }
  return url;
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

async function processContent(
  contentResponse,
  originalUrl,
  computedUrl,
  currentUrl,
  totalUrls
) {
  const $ = cheerio.load(contentResponse.data);

  const sections = $('div[role="main"] > div.row > section')
    .map((i, el) => $(el).html())
    .get();
  let imageUrls = [];

  if (sections.length) {
    // join the sections
    const contentHtml = sections.join("\n");

    // transform the content to WP blocks using the original URL
    const transformedToWPContent = await transformToWPBlocks(
      contentHtml,
      originalUrl
    );

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
    const directoryPath = createDirectoriesFromUrl(computedUrl);
    const sanitizedFileName = sanitizeFileName(computedUrl) + ".txt";
    const filePath = path.join(directoryPath, sanitizedFileName);
    fs.writeFileSync(filePath, transformedToWPContent);
    console.log(`Finished: ${currentUrl} of ${totalUrls}: ✅ : ${computedUrl}`);
    logMessage(
      `Successfully processed: ${computedUrl} - Status: ${contentResponse.status}`
    );

    // Extract the page title and get text up until the first `-`
    let pageTitle = $("title").text().trim();
    if (pageTitle.includes(" - ")) {
      pageTitle = pageTitle.split(" - ")[0].trim();
    }
    pageTitle = pageTitle || `Page ${currentUrl}`;

    // Extract the page meta description
    const metaDescription = $('meta[name="description"]').attr("content");

    // Clean up the slug from computedUrl
    let slug = computedUrl
      .replace(/^vancouver\.wsu\.edu\//, "") // Remove domain
      .replace(/\/$/, ""); // Remove trailing slash

    // Ensure we don't have any duplicate path segments
    const pathSegments = [...new Set(slug.split("/"))];
    slug = pathSegments.join("/");

    const post = {
      title: pageTitle,
      content: transformedToWPContent,
      status: "publish",
      meta: {
        description: metaDescription,
      },
      // Use the full path from computedUrl for the slug
      slug: slug,
      images: imageUrls,
    };

    // let pageId = null;
    // Post the content to the WordPress API
    const pageId = await postToWordPress(post);

    return { url: computedUrl, pageId };
  } else {
    console.log(
      `Finished: ${currentUrl} of ${totalUrls}: ❌ (No section found): ${computedUrl}`
    );
    logMessage(
      `No section found for: ${computedUrl} - Status: ${contentResponse.status}`
    );
    return { url: computedUrl, pageId: null };
  }
}

// Fetch and process a single URL
async function fetchUrl(originalUrl, computedUrl, currentUrl, totalUrls) {
  try {
    // Ensure the URLs have the correct protocol
    originalUrl = ensureUrlProtocol(originalUrl);
    computedUrl = ensureUrlProtocol(computedUrl);

    // Determine the target URL, following redirects if necessary
    const targetUrl = originalUrl;

    // Check if the parent pages exist
    // Check if the parent pages exist
    const pathSegments = computedUrl
      .replace(/^(?:https?:\/\/)?(?:www\.)?vancouver\.wsu\.edu\//, "") // Remove domain
      .split("/")
      .filter(Boolean);

    const currentSlug = pathSegments[pathSegments.length - 1];

    if (pathSegments.length > 1) {
      const parentSlug = pathSegments.slice(0, -1).join("/");
      console.log(`Checking for parent page: ${parentSlug}`);
      const parentId = await findPageBySlug(parentSlug);

      if (!parentId) {
        console.log(
          `Parent page "${parentSlug}" not found. Skipping creation of "${currentSlug}"`
        );
        logMessage(
          `Skipped: ${currentSlug} - parent ${parentSlug} does not exist`
        );
        return { url: computedUrl, pageId: null };
      }

      console.log(
        `Found parent page (ID: ${parentId}). Proceeding to scrape and create child page: ${currentSlug}`
      );
    } else {
      console.log(`Creating root-level page: ${currentSlug}`);
    }

    // Perform a GET request to fetch the content
    const contentResponse = await axios.get(targetUrl, {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });

    // Process the fetched content
    return await processContent(
      contentResponse,
      originalUrl,
      computedUrl,
      currentUrl,
      totalUrls
    );
  } catch (error) {
    // Log errors and append to the error file
    const errorMessage = `Error processing URL ${originalUrl}: ${error.message}`;
    fs.appendFileSync(ERROR_URL_FILE, `${errorMessage}\n`);
    console.error(`❌ ${errorMessage}`);
    logMessage(errorMessage);

    if (error.response) {
      const responseDetails = `Response status: ${
        error.response.status
      }, data: ${JSON.stringify(error.response.data)}`;
      console.error(`📉 ${responseDetails}`);
      logMessage(responseDetails);
    }

    return { url: computedUrl, pageId: null };
  }
}

// Main function to process URLs from the Google Sheet
async function checkUrls() {
  try {
    const auth = await getAuthToken();
    let urls = await getUrlsFromSheet(auth);

    if (urls.length === 0) {
      console.error("No URLs found in the Google Sheet.");
      process.exit(1);
    }

    // Limit the number of URLs to process
    urls = urls.slice(0, URL_PROCESS_LIMIT);

    let currentUrl = 0;
    const totalUrls = urls.length;
    // Clear the error file
    fs.writeFileSync(ERROR_URL_FILE, "");

    // Capture the start time
    const startTime = new Date();

    // Process URLs with a limited number of concurrent requests
    const results = [];
    const processQueue = async () => {
      if (urls.length === 0) return;

      const activeRequests = [];
      while (activeRequests.length < CONCURRENCY_LIMIT && urls.length > 0) {
        const urlData = urls.shift();
        activeRequests.push(
          fetchUrl(
            urlData.originalUrl,
            urlData.computedUrl,
            ++currentUrl,
            totalUrls
          )
            .then(async (result) => {
              results.push(result);
              if (result.pageId) {
                await updateSheetWithTimestamp(
                  auth,
                  urlData.rowNumber,
                  result.pageId
                );
              }
            })
            .finally(() => {
              const index = activeRequests.indexOf(urlData.originalUrl);
              if (index > -1) activeRequests.splice(index, 1);
            })
        );
        await new Promise((resolve) => setTimeout(resolve, CRAWL_DELAY_MS));
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
  } catch (error) {
    console.error("Error:", error);
  }
}

// Start the URL checking process
checkUrls();
