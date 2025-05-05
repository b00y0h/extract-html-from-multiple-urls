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
} = require("./src/postToWordpress");
const { transformToWPBlocks } = require("./src/cleanHtmlContent");
const {
  getAuthToken,
  getUrlsFromSheet,
  updateSheetWithTimestamp,
} = require("./src/updateGoogleSheet");
const {
  ensureUrlProtocol,
  createDirectoriesFromUrl,
  sanitizeFileName,
  sortUrlsByHierarchy,
  verifyParentHierarchy,
} = require("./src/utils/urls");
const { logMessage } = require("./src/utils/logs");
// Load environment variables from a .env file if present
require("dotenv").config();

// Constants
const ERROR_URL_FILE = "error_url.txt";
const CONCURRENCY_LIMIT = 5; // Adjust concurrency limit if needed
const CRAWL_DELAY_MS = 0; // 2 seconds delay between requests
const USER_AGENT =
  "EAB Crawler/1.0 (https://agency.eab.com/; bobsmith@eab.com)";
const URL_PROCESS_LIMIT = 300; // Limit the number of URLs to process

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

async function processContent(
  contentResponse,
  originalUrl,
  computedUrl,
  currentUrl,
  totalUrls
) {
  console.log(`\n🔄 CONTENT PROCESSING START ---------------------`);
  console.log(`📝 Processing content for: ${computedUrl}`);

  const $ = cheerio.load(contentResponse.data);

  // Log the HTML structure we're trying to parse
  console.log(
    `🔍 Looking for sections with selector: div[role="main"] > div.row > section`
  );

  // Log the full HTML structure for debugging
  // console.log(`📄 Page HTML structure:`);
  // console.log($("body").html().substring(0, 500) + "...");

  const sections = $('div[role="main"] > div.row > section')
    .map((i, el) => $(el).html())
    .get();

  console.log(`📊 Found ${sections.length} sections`);
  let imageUrls = [];

  if (sections.length) {
    console.log(`✅ Found content sections, proceeding with processing`);

    // join the sections
    const contentHtml = sections.join("\n");
    console.log(`📦 Combined section length: ${contentHtml.length} characters`);

    // transform the content to WP blocks using the original URL
    console.log(`🔄 Transforming content to WP blocks...`);
    const transformedToWPContent = await transformToWPBlocks(
      contentHtml,
      originalUrl
    );
    console.log(`✅ Content transformed`);

    const content$ = cheerio.load(transformedToWPContent);

    // grab all the image urls out of the contentHtml
    console.log(`🖼️  Scanning for images...`);
    content$("img").each((i, el) => {
      const imageUrl = content$(el).attr("src");
      const imageAlt = content$(el).attr("alt");
      if (imageUrl) {
        imageUrls.push({ url: imageUrl, alt: imageAlt });
      }
    });
    console.log(`📸 Found ${imageUrls.length} images`);

    // Save the content to a file
    console.log(`💾 Saving content to file...`);
    const directoryPath = createDirectoriesFromUrl(originalUrl);
    const sanitizedFileName = sanitizeFileName(originalUrl) + ".txt";
    const filePath = path.join(directoryPath, sanitizedFileName);
    fs.writeFileSync(filePath, transformedToWPContent);
    console.log(`✅ Content saved to: ${filePath}`);

    console.log(`Finished: ${currentUrl} of ${totalUrls}: ✅ : ${computedUrl}`);
    logMessage(
      `Successfully processed: ${computedUrl} - Status: ${contentResponse.status}`
    );

    // Extract the page title
    console.log(`📑 Extracting page metadata...`);
    let pageTitle = $("title").text().trim();
    console.log(`📌 Original title: ${pageTitle}`);
    if (pageTitle.includes(" - ")) {
      pageTitle = pageTitle.split(" - ")[0].trim();
    }
    pageTitle = pageTitle || `Page ${currentUrl}`;
    console.log(`📌 Final title: ${pageTitle}`);

    // Extract the page meta description
    const metaDescription = $('meta[name="description"]').attr("content");
    console.log(`📝 Meta description: ${metaDescription || "None found"}`);

    // Clean up the slug
    console.log(`🔧 Processing slug...`);
    let slug = computedUrl
      .replace(/^vancouver\.wsu\.edu\//, "") // Remove domain
      .replace(/\/$/, ""); // Remove trailing slash

    // Ensure we don't have duplicate path segments
    const pathSegments = [...new Set(slug.split("/"))];
    slug = pathSegments.join("/");
    console.log(`🏷️  Final slug: ${slug}`);

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

    console.log(`📤 Sending to WordPress...`);
    const pageId = await postToWordPress(post);

    if (pageId) {
      console.log(`✨ Successfully created WordPress page with ID: ${pageId}`);
    } else {
      console.log(`❌ Failed to create WordPress page`);
    }

    console.log(`🔄 CONTENT PROCESSING END ---------------------\n`);
    return { url: computedUrl, pageId };
  } else {
    console.log(
      `❌ No sections found in HTML. Trying alternative selectors...`
    );

    // Try alternative selectors
    const mainContent =
      $("main").html() || $("article").html() || $(".content").html();
    if (mainContent) {
      console.log(`✅ Found content with alternative selector`);
      // Process this content instead
      // ... (you could add logic here to process alternative content)
    }

    console.log(
      `Finished: ${currentUrl} of ${totalUrls}: ❌ (No section found): ${computedUrl}`
    );
    logMessage(
      `No section found for: ${computedUrl} - Status: ${contentResponse.status}`
    );
    console.log(
      `🔄 CONTENT PROCESSING END (NO CONTENT) ---------------------\n`
    );
    return { url: computedUrl, pageId: null };
  }
}

// Complete fetchUrl function with hierarchy verification
async function fetchUrl(originalUrl, computedUrl, currentUrl, totalUrls) {
  try {
    // Ensure the URLs have the correct protocol
    originalUrl = ensureUrlProtocol(originalUrl);
    computedUrl = ensureUrlProtocol(computedUrl);

    // Determine the target URL, following redirects if necessary
    const targetUrl = originalUrl;

    // Add the debug section here, after protocol checks but before any processing
    console.log("\n🔍 URL ANALYSIS -------------------------");
    console.log("Original URL:", originalUrl);
    console.log("Computed URL:", computedUrl);
    console.log("URL components:");
    console.log("- Protocol:", new URL(computedUrl).protocol);
    console.log("- Host:", new URL(computedUrl).host);
    console.log("- Pathname:", new URL(computedUrl).pathname);
    console.log(
      "- Encoded pathname:",
      encodeURIComponent(new URL(computedUrl).pathname)
    );
    console.log("🔍 URL ANALYSIS END ---------------------\n");

    console.log(`\n🚀 PROCESSING START -------------------------`);
    console.log(`📍 Processing URL ${currentUrl} of ${totalUrls}`);
    console.log(`🔗 Original URL: ${originalUrl}`);
    console.log(`🎯 Computed URL: ${computedUrl}`);

    // Get clean path segments
    const pathSegments = computedUrl
      .replace(/^(?:https?:\/\/)?(?:www\.)?vancouver\.wsu\.edu\//, "")
      .split("/")
      .filter(Boolean);

    const currentSlug = pathSegments[pathSegments.length - 1];
    console.log(`📚 Path segments:`, pathSegments);
    console.log(`🏷️  Current slug: ${currentSlug}`);

    // Verify entire parent hierarchy before proceeding
    console.log(`🔍 Verifying parent hierarchy...`);
    const hierarchyValid = await verifyParentHierarchy(computedUrl);
    if (!hierarchyValid) {
      console.log(`⚠️ Skipping ${computedUrl} - parent hierarchy incomplete`);
      console.log(`🚀 PROCESSING END -------------------------\n`);
      return { url: computedUrl, pageId: null };
    }
    console.log(`✅ Parent hierarchy verified`);

    // Perform a GET request to fetch the content
    console.log(`📥 Fetching content from: ${targetUrl}`);
    const contentResponse = await axios.get(targetUrl, {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });
    console.log(`✅ Content fetched successfully`);

    // Process the fetched content
    const result = await processContent(
      contentResponse,
      originalUrl,
      computedUrl,
      currentUrl,
      totalUrls
    );

    if (result.pageId) {
      console.log(`✨ Page created successfully with ID: ${result.pageId}`);
    } else {
      console.log(`⚠️  Page creation failed`);
    }

    console.log(`🚀 PROCESSING END -------------------------\n`);
    return result;
  } catch (error) {
    // Log errors and append to the error file
    const errorMessage = `Error processing URL ${originalUrl}: ${error.message}`;
    fs.appendFileSync(ERROR_URL_FILE, `${errorMessage}\n`);
    console.error(`💥 ${errorMessage}`);
    logMessage(errorMessage);

    if (error.response) {
      const responseDetails = `Response status: ${
        error.response.status
      }, data: ${JSON.stringify(error.response.data)}`;
      console.error(`📉 ${responseDetails}`);
      logMessage(responseDetails);
    }

    console.log(`🚀 PROCESSING END (WITH ERROR) -------------------------\n`);
    return { url: computedUrl, pageId: null };
  }
}

// Main function to process URLs from the Google Sheet
async function checkUrls(customUrls = null) {
  try {
    const auth = await getAuthToken();
    let urls = customUrls || (await getUrlsFromSheet(auth));

    if (urls.length === 0) {
      console.error("No URLs found.");
      process.exit(1);
    }

    // Sort URLs by hierarchy
    urls = sortUrlsByHierarchy(urls);

    // Limit the number of URLs to process
    urls = urls.slice(0, URL_PROCESS_LIMIT);

    console.log("\n📊 URL Processing Order:");
    urls.forEach((url, index) => {
      const depth = (url.computedUrl.match(/\//g) || []).length;
      console.log(`${index + 1}. ${"  ".repeat(depth)}${url.computedUrl}`);
    });
    console.log("\n");

    let currentUrl = 0;
    const totalUrls = urls.length;
    // Clear the error file
    fs.writeFileSync(ERROR_URL_FILE, "");

    // Capture the start time
    const startTime = new Date();

    // Track URLs that didn't get uploaded due to missing parents
    const urlsMissingParents = [];

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
              } else if (!result.pageId && result.url) {
                urlsMissingParents.push(result.url);
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
    const successfulPagesCount = results.filter(
      (result) => result.pageId
    ).length;

    console.log("\nReport generated:");
    console.log(`Total URLs processed: ${totalUrls}`);
    console.log(`URLs with Error: ${withErrorUrlCount}`);
    console.log(
      `Pages successfully created in WordPress: ${successfulPagesCount}`
    );
    console.log(
      `URLs that didn't get uploaded due to missing parents: ${urlsMissingParents.length}`
    );
    urlsMissingParents.forEach((url) => console.log(`- ${url}`));
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

const customUrls = [
  {
    originalUrl:
      "https://studentaffairs.vancouver.wsu.edu/registrars-office/course-catalog",
    computedUrl: "https://vancouver.wsu.edu/academics/academic-calendar",
  },
];

// Start the URL checking process
checkUrls();
