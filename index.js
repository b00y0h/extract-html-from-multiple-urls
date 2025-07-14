const { ProcessingStats } = require("./src/utils/statistics");
const fs = require("fs");
const readline = require("readline");
const axios = require("axios");
const cheerio = require("cheerio");
const https = require("https");
const path = require("path");
const config = require("./src/config");
const { findPageBySlug } = require("./src/postToWordpress");
const {
  postToWordPress,
  updateParentPage,
  getParentPageSlug,
  processImage,
  validateWordPressConnection,
} = require("./src/postToWordpress");
const {
  transformToWPBlocks,
  cleanHtmlContent,
} = require("./src/cleanHtmlContent");
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
  transformToStagingUrl,
  transformUrl,
  getRootUrl,
} = require("./src/utils/urls");
const { logMessage } = require("./src/utils/logs");
const { log } = require("console");
const { clearCache } = require("./src/utils/pageCache");
const { syncCacheWithSpreadsheet } = require("./src/utils/cacheSync");
// Load environment variables from a .env file if present
require("dotenv").config();

// Replace constants with config values
const ERROR_URL_FILE = config.paths.errorUrlFile;
const NOT_FOUND_URL_FILE = path.join(
  path.dirname(ERROR_URL_FILE),
  "not_found_url.txt"
); // New file for 404 errors
const CONCURRENCY_LIMIT = config.crawler.concurrencyLimit;
const CRAWL_DELAY_MS = config.crawler.crawlDelayMs;
const USER_AGENT = config.crawler.userAgent;
const URL_PROCESS_LIMIT = config.crawler.urlProcessLimit;

// Sleep function for rate limiting
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Create a global stats instance
const stats = new ProcessingStats();
let isShuttingDown = false;

// Add the shutdown handler
process.on("SIGINT", async () => {
  console.log("\n\n🛑 Gracefully shutting down...");
  isShuttingDown = true;

  // Generate the report
  stats.generateReport(true);

  // Exit after a short delay to ensure the report is printed
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

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

// New function to process images before sending to WordPress
async function processContentImages(content, images) {
  if (!images || images.length === 0) {
    return { content, successfulMedia: [] };
  }

  console.log(`🔄 Processing ${images.length} images for content...`);

  // Process each image
  const successfulMedia = [];
  let updatedContent = content;

  for (const image of images) {
    try {
      console.log(`📸 Processing image: ${image.url}`);

      // Ensure the images directory exists
      if (!fs.existsSync(config.paths.imagesDir)) {
        console.log(
          `DEBUG: Creating images directory: ${config.paths.imagesDir}`
        );
        fs.mkdirSync(config.paths.imagesDir, { recursive: true, mode: 0o755 });
        console.log(`DEBUG: Images directory created`);
      }

      const result = await processImage(image);
      if (result) {
        successfulMedia.push(result);

        // Replace the image URL in the content
        const originalUrl = image.url;
        const wpUrl = result.wordpressUrl;

        // Use a regex that handles both quoted and unquoted URLs
        const urlRegex = new RegExp(
          originalUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "g"
        );
        updatedContent = updatedContent.replace(urlRegex, wpUrl);

        console.log(`✅ Replaced image URL: ${originalUrl} → ${wpUrl}`);
      }
    } catch (error) {
      console.error(`❌ Error processing image: ${error.message}`);
    }
  }

  return { content: updatedContent, successfulMedia };
}

async function processContent(
  contentResponse,
  originalUrl,
  computedUrl,
  currentUrl,
  totalUrls,
  action = "Move" // Add action parameter with default value
) {
  console.log(`\n🔄 CONTENT PROCESSING START ---------------------`);
  console.log(`📝 Processing content for: ${computedUrl}`);
  console.log(`🎯 Action: ${action}`);
  if (!contentResponse || action === "Create") {
    console.log(`Creating page with dummy content for action: ${action}`);
    const pathSegments = computedUrl.split("/").filter(Boolean);
    const slug = pathSegments[pathSegments.length - 1];
    const title =
      slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " ");

    const dummyContent = `<!-- wp:paragraph -->
<p>This is a placeholder page for ${title}. Content will be added soon.</p>
<!-- /wp:paragraph -->`;

    console.log(`📑 Generated dummy content for: ${title}`);

    // Post the dummy content to WordPress
    console.log(`📤 Sending to WordPress...`);
    const result = await postToWordPress(computedUrl, dummyContent, title);
    const pageId = result.pageId;

    if (pageId) {
      console.log(`✨ Successfully created WordPress page with ID: ${pageId}`);
      return { url: computedUrl, pageId };
    } else {
      console.log(`❌ Failed to create WordPress page`);
      return { url: computedUrl, pageId: null };
    }
  }

  const $ = cheerio.load(contentResponse.data);
  console.log(
    `🔍 Looking for sections with selector: div[role="main"] > div.row > section`
  );

  const sections = $('div[role="main"] > div.row > section')
    .map((i, el) => $(el).html())
    .get();

  console.log(`📊 Found ${sections.length} sections`);

  if (sections.length) {
    console.log(`✅ Found content sections, proceeding with processing`);

    // Join the sections
    const contentHtml = sections.join("\n");
    console.log(`📦 Combined section length: ${contentHtml.length} characters`);

    // Extract images first
    console.log(`🔍 Extracting images from content...`);
    const images = [];
    const tempDoc = cheerio.load(contentHtml);
    tempDoc("img").each((i, el) => {
      let src = tempDoc(el).attr("src");
      const alt = tempDoc(el).attr("alt") || "";
      const title = tempDoc(el).attr("title") || "";

      if (src) {
        const rootUrl = getRootUrl(originalUrl);
        if (src.startsWith("/")) {
          src = `${rootUrl}${src}`;
        } else if (!src.startsWith("http")) {
          src = `${rootUrl}/${src}`;
        }

        images.push({
          url: src,
          alt,
          title,
        });
      }
    });

    console.log(`📸 Found ${images.length} images to process`);

    // Process all images first
    let successfulMedia = [];
    if (images.length > 0) {
      try {
        const mediaResults = await Promise.allSettled(
          images.map(async (image) => {
            try {
              return await processImage(image);
            } catch (error) {
              console.log(
                `⚠️ Failed to process image ${image.url}: ${error.message}`
              );
              return null;
            }
          })
        );

        // Filter out failed image processing attempts and log results
        successfulMedia = mediaResults
          .filter((result) => result.status === "fulfilled" && result.value)
          .map((result) => result.value);

        console.log(
          `✅ Successfully processed ${successfulMedia.length} images`
        );
      } catch (error) {
        console.log(
          `⚠️ Image processing failed but continuing: ${error.message}`
        );
      }
    }

    // Now transform the content WITH the media results
    console.log(
      `🔄 Transforming content with ${successfulMedia.length} processed images...`
    );
    const transformResult = await transformToWPBlocks(
      contentHtml,
      originalUrl,
      successfulMedia, // Pass the processed media results
      computedUrl // Pass the WordPress destination URL
    );

    let transformedToWPContent = transformResult.content;

    // Save the content to a file
    console.log(`💾 Saving content to file...`);
    const directoryPath = createDirectoriesFromUrl(originalUrl);
    const sanitizedFileName = sanitizeFileName(originalUrl) + ".txt";
    const filePath = path.join(directoryPath, sanitizedFileName);
    fs.writeFileSync(filePath, transformedToWPContent);
    console.log(`✅ Content saved to: ${filePath}`);

    // ...rest of the code...
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
    // console.log(`📝 Meta description: ${metaDescription || "None found"}`);

    // Clean the slug
    const slug = computedUrl
      .replace(/^(?:https?:\/\/)?(?:www\.)?[^/]+\//, "")
      .replace(/^\/+|\/+$/g, "");

    const post = {
      title: pageTitle,
      content: transformedToWPContent,
      status: "publish",
      meta: {
        description: metaDescription,
      },
      slug: slug || "",
      featuredMediaId:
        successfulMedia.length > 0 ? successfulMedia[0].id : null,
      successfulMedia: successfulMedia,
    };

    console.log(`📤 Sending to WordPress...`);
    const result = await postToWordPress(
      computedUrl,
      transformedToWPContent,
      pageTitle
    );

    const pageId = result.pageId;

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
    console.log(`\n🚀 PROCESSING START -------------------------`);
    console.log(`📍 Processing URL ${currentUrl} of ${totalUrls}`);
    console.log(
      `🔗 Original URL: ${
        typeof originalUrl === "object" ? originalUrl.originalUrl : originalUrl
      }`
    );
    console.log(`🎯 Destination URL: ${computedUrl}`);
    console.log(
      `🎯 Action: ${
        typeof originalUrl === "object" ? originalUrl.action : "Move"
      }`
    );

    // Get clean path segments
    const pathSegments = computedUrl
      .replace(/^(?:https?:\/\/)?(?:www\.)?[^/]+\//, "")
      .split("/")
      .filter(Boolean);

    const currentSlug = pathSegments[pathSegments.length - 1];
    console.log(`📚 Path segments:`, pathSegments);
    console.log(`🏷️  Current slug: ${currentSlug}`);

    // Verify parent hierarchy
    console.log(`🔍 Verifying parent hierarchy...`);
    const hierarchyResult = await verifyParentHierarchy(
      computedUrl,
      originalUrl.action || "Move"
    );
    if (hierarchyResult === null) {
      console.log(`⚠️ Skipping ${computedUrl} - parent hierarchy incomplete`);
      console.log(`🚀 PROCESSING END -------------------------\n`);
      return { url: computedUrl, pageId: null, missingParent: true };
    }
    console.log(`✅ Parent hierarchy verified`);

    // Check if the page already exists before attempting content fetch
    // For deeper hierarchies, we need to check with the correct parent ID
    const parentId = hierarchyResult; // This is the parent ID from hierarchy verification
    const existingPage = await findPageBySlug(currentSlug, parentId);
    if (existingPage) {
      console.log(
        `✨ Page already exists with ID ${existingPage}, skipping content processing`
      );
      return { url: computedUrl, pageId: existingPage };
    }

    // For Create action, skip content fetching
    const action =
      typeof originalUrl === "object" ? originalUrl.action : "Move";
    if (action === "Create") {
      console.log("🔄 Create action - processing with dummy content");
      const result = await processContent(
        null,
        originalUrl,
        computedUrl,
        currentUrl,
        totalUrls,
        "Create"
      );
      return result;
    }

    // For Move actions, fetch and process content
    console.log(`🔄 Checking for redirects...`);
    await sleep(config.crawler.crawlDelayMs);

    // Configure axios for content fetching
    const axiosConfig = {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: {
        "User-Agent": USER_AGENT,
      },
      maxRedirects: 10,
      validateStatus: function (status) {
        return status >= 200 && status < 500; // Allow 404s to be handled in our code
      },
    };

    // Get the URL to fetch from
    const urlToFetch =
      originalUrl.originalUrl ||
      (typeof originalUrl === "string" ? originalUrl : null);
    if (!urlToFetch) {
      throw new Error("No valid URL to fetch content from");
    }

    console.log(
      `📥 Fetching content from URL: ${originalUrl.originalUrl || originalUrl}`
    );
    const contentResponse = await axios.get(urlToFetch, axiosConfig);

    // Check for 404 response
    if (contentResponse.status === 404) {
      console.log(`⚠️ URL returned 404 (Not Found): ${urlToFetch}`);
      logMessage(`404 Not Found: ${urlToFetch}\n`, ERROR_URL_FILE);
      logMessage(`${urlToFetch}\n`, NOT_FOUND_URL_FILE); // Add to dedicated 404 log
      return {
        url: originalUrl.originalUrl || originalUrl,
        pageId: null,
        status: 404,
      };
    }

    console.log(`✅ Content fetched successfully`);

    // Process the fetched content
    const result = await processContent(
      contentResponse,
      originalUrl.originalUrl || originalUrl,
      computedUrl,
      currentUrl,
      totalUrls,
      originalUrl.action || "Move"
    );

    if (result.pageId) {
      console.log(`✨ Page created successfully with ID: ${result.pageId}`);
    } else {
      console.log(`⚠️  Page creation failed`);
    }

    console.log(`🚀 PROCESSING END -------------------------\n`);
    return result;
  } catch (error) {
    const errorMessage = `Error processing URL ${
      originalUrl.originalUrl || originalUrl
    }: ${error.message}`;
    logMessage(`${errorMessage}\n`, ERROR_URL_FILE);
    console.error(`💥 ${errorMessage}`);

    // Check specifically for 404 errors
    let status = null;
    if (error.response) {
      status = error.response.status;
      let responseDetails = `Response status: ${status}`;
      if (status !== 404) {
        responseDetails += `, data: ${JSON.stringify(error.response.data)}`;
      } else {
        console.log(
          `⚠️ URL returned 404 (Not Found): ${
            originalUrl.originalUrl || originalUrl
          }`
        );
        logMessage(
          `${originalUrl.originalUrl || originalUrl}\n`,
          NOT_FOUND_URL_FILE
        ); // Add to dedicated 404 log
      }
      console.error(`📉 ${responseDetails}`);
      logMessage(responseDetails);
    }

    console.log(`🚀 PROCESSING END (WITH ERROR) -------------------------\n`);
    return {
      url: originalUrl.originalUrl || originalUrl,
      pageId: null,
      status: status,
    };
  }
}

// Main function to process URLs from the Google Sheet
async function checkUrls(customUrls = null) {
  try {
    // Validate WordPress connection before proceeding with migration
    console.log("Validating WordPress connection before starting migration...");
    try {
      await validateWordPressConnection();
      console.log(
        "✅ WordPress connection validated successfully! Proceeding with migration."
      );
    } catch (wpError) {
      console.error(
        "❌ WordPress connection validation failed. Migration aborted."
      );
      console.error(wpError.message);

      // Provide more specific guidance for 403 errors
      if (wpError.message.includes("403")) {
        console.error("\n🔍 SPECIFIC ADVICE FOR 403 ERRORS:");
        console.error("1. Create an application password in WordPress admin:");
        console.error(
          "   - Go to Users → Profile → Application Passwords section"
        );
        console.error("   - Enter a name like 'Migration Script'");
        console.error("   - Click 'Add New Application Password'");
        console.error(
          "   - Copy the generated password and use it in your .env file"
        );
        console.error(
          "2. Check your WordPress site's .htaccess file for any restrictions"
        );
        console.error(
          "3. Try a different user account with administrator privileges"
        );
        console.error(
          "4. Temporarily disable security plugins like Wordfence, iThemes Security, etc."
        );
        console.error(
          "5. Make sure the REST API is not blocked by WordPress settings or plugins"
        );
        console.error(
          "\nRun the standalone validation tool for more detailed diagnostics:"
        );
        console.error("$ node checkWpConnection.js");
      }

      process.exit(1);
    }

    const auth = await getAuthToken();
    let urls = customUrls || (await getUrlsFromSheet(auth));

    // Initialize stats
    stats.totalUrls = urls.length;

    if (urls.length === 0) {
      console.error("No URLs found.");
      process.exit(1);
    }

    // URLs are already sorted by priority from getUrlsFromSheet
    // Additional sort by hierarchy while maintaining priority order
    const priorityUrls = urls.filter((url) => url.processFirst);
    const nonPriorityUrls = urls.filter((url) => !url.processFirst);

    // Sort each group by hierarchy
    const sortedPriorityUrls = sortUrlsByHierarchy(priorityUrls);
    const sortedNonPriorityUrls = sortUrlsByHierarchy(nonPriorityUrls);

    // Combine the sorted groups
    urls = [...sortedPriorityUrls, ...sortedNonPriorityUrls];

    // Pre-populate the page cache with data from the spreadsheet
    // This helps avoid "Missing Parents" issues when parents already exist
    await syncCacheWithSpreadsheet(urls);

    // Limit the number of URLs to process
    urls = urls.slice(0, URL_PROCESS_LIMIT);

    console.log("\n📊 URL Processing Order:");
    urls.forEach((url, index) => {
      const depth = (url.computedUrl.match(/\//g) || []).length;
      const priority = url.processFirst ? "🔥 PRIORITY" : "  Regular";
      console.log(
        `${index + 1}. ${priority} ${"  ".repeat(depth)}${url.computedUrl}`
      );
    });
    console.log("\n");

    let currentUrl = 0;
    const totalUrls = urls.length;
    // Clear the error files
    fs.writeFileSync(ERROR_URL_FILE, "");
    fs.writeFileSync(NOT_FOUND_URL_FILE, ""); // Initialize the 404 log file

    // Capture the start time
    const startTime = new Date();

    // Track URLs that didn't get uploaded due to missing parents
    const urlsMissingParents = [];

    // Process URLs with a limited number of concurrent requests
    const results = [];
    const processQueue = async () => {
      if (urls.length === 0 || isShuttingDown) return;

      const activeRequests = [];
      while (
        activeRequests.length < CONCURRENCY_LIMIT &&
        urls.length > 0 &&
        !isShuttingDown
      ) {
        const urlData = urls.shift();
        activeRequests.push(
          fetchUrl(
            urlData.originalUrl,
            urlData.computedUrl,
            ++currentUrl,
            totalUrls
          )
            .then(async (result) => {
              stats.addResult(result);

              // Track URLs with missing parents
              if (result.missingParent) {
                urlsMissingParents.push(urlData.computedUrl);
              }

              if (result.pageId) {
                await updateSheetWithTimestamp(
                  auth,
                  urlData.rowNumber,
                  result.pageId
                );
              }
            })
            .catch((error) => {
              stats.errors++;
              console.error(`Error processing ${urlData.computedUrl}:`, error);
            })
        );
        await new Promise((resolve) => setTimeout(resolve, CRAWL_DELAY_MS));
      }

      await Promise.all(activeRequests);
      if (!isShuttingDown) {
        await processQueue();
      }
    };

    await processQueue();
    // Only generate the final report if we haven't been interrupted
    if (!isShuttingDown) {
      stats.generateReport();

      // Clear the page cache to free up memory
      console.log("🧹 Clearing page cache...");
      clearCache();
    }
  } catch (error) {
    console.error("Error:", error);
    stats.generateReport(true);
  }
}

// Start the URL checking process
checkUrls();
