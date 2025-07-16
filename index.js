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
const MISSING_PARENTS_FILE = path.join(
  path.dirname(ERROR_URL_FILE),
  "missing_parents.txt"
); // New file for URLs with missing parents
const CONCURRENCY_LIMIT = config.crawler.concurrencyLimit;
const CRAWL_DELAY_MS = config.crawler.crawlDelayMs;
const USER_AGENT = config.crawler.userAgent;
const URL_PROCESS_LIMIT = config.crawler.urlProcessLimit;
console.log(`🚨 DEBUG: URL Process Limit configured as: ${URL_PROCESS_LIMIT}`);

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

  // Only use dummy content for "Create" action, not for "Move"
  if (!contentResponse && action === "Create") {
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
    const result = await postToWordPress(
      computedUrl,
      dummyContent,
      title,
      action
    );
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
      pageTitle,
      action // Pass the action parameter
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

    // Verify parent hierarchy using the enhanced system
    console.log(`🔍 Verifying parent hierarchy...`);
    const action =
      typeof originalUrl === "object" ? originalUrl.action : "Move";
    const hierarchyResult = await verifyParentHierarchy(computedUrl, action);

    if (hierarchyResult === null) {
      console.log(`⚠️ Skipping ${computedUrl} - parent hierarchy incomplete`);
      console.log(`🚀 PROCESSING END -------------------------\n`);
      return { url: computedUrl, pageId: null, missingParent: true };
    }
    console.log(`✅ Parent hierarchy verified`);

    // Check if the page already exists with the correct parent
    const parentId = hierarchyResult; // This is the parent ID from hierarchy verification
    const existingPage = await findPageBySlug(currentSlug, parentId);
    if (existingPage) {
      console.log(
        `✨ Page already exists with ID ${existingPage}, skipping content processing`
      );
      return { url: computedUrl, pageId: existingPage };
    }

    // For Create action, skip content fetching
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

    // Get the hostname from the URL for the Referer header
    let hostname = "";
    try {
      const urlObj = new URL(originalUrl.originalUrl || originalUrl);
      hostname = urlObj.hostname;
    } catch (e) {
      console.log(`⚠️ Could not parse URL for hostname: ${e.message}`);
    }

    // Configure axios for content fetching with browser-like headers
    const axiosConfig = {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Cache-Control": "max-age=0",
        "Sec-Ch-Ua":
          '"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"macOS"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Upgrade-Insecure-Requests": "1",
        Referer: hostname ? `https://${hostname}` : undefined,
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

      // Special handling for common error codes
      if (status === 403) {
        console.error(
          `\n⛔ FORBIDDEN (403) ACCESS ERROR for URL: ${
            originalUrl.originalUrl || originalUrl
          }`
        );
        console.error(
          `This usually means the website is blocking automated requests.`
        );
        console.error(`Possible solutions:`);
        console.error(
          `1. Add a delay between requests (increase crawlDelayMs in config)`
        );
        console.error(
          `2. Update the User-Agent to a more recent browser version`
        );
        console.error(`3. Try accessing through a different IP address`);
        console.error(
          `4. Check if the site requires cookies or session tokens`
        );

        // Try to get any error details that might help
        try {
          const responseText = error.response.data
            ? typeof error.response.data === "string"
              ? error.response.data.substring(0, 500)
              : JSON.stringify(error.response.data).substring(0, 500)
            : "No response data";
          console.error(`\nResponse excerpt: ${responseText}...`);
        } catch (e) {
          console.error(`Could not extract response data: ${e.message}`);
        }
      } else if (status === 404) {
        console.log(
          `⚠️ URL returned 404 (Not Found): ${
            originalUrl.originalUrl || originalUrl
          }`
        );
        logMessage(
          `${originalUrl.originalUrl || originalUrl}\n`,
          NOT_FOUND_URL_FILE
        ); // Add to dedicated 404 log
      } else {
        responseDetails += `, data: ${JSON.stringify(error.response.data)}`;
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
    console.log("\n========================================================");
    console.log(`🔢 URL PROCESS LIMIT: ${URL_PROCESS_LIMIT}`);
    if (URL_PROCESS_LIMIT <= 0) {
      console.log(
        `⚠️ PROCESSING ALL URLS (limit disabled by setting to ${URL_PROCESS_LIMIT})`
      );
    } else {
      console.log(
        `✅ Will process at most ${URL_PROCESS_LIMIT} URLs from spreadsheet`
      );
    }
    console.log("========================================================\n");

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

    // Check if there are actually URLs to process before doing anything else
    if (urls.length === 0) {
      console.error(
        "\n⚠️ No URLs found to process. Check your Google Sheet for the following issues:"
      );
      console.error(
        "1. Make sure your sheet has rows with Source URLs and destination URLs"
      );
      console.error(
        "2. Make sure the 'Date Imported' column is empty for URLs you want to process"
      );
      console.error(
        "3. Make sure the Action column has 'Move' or 'Create' values"
      );
      console.error(
        "4. Verify the column headers match exactly what the script expects"
      );
      console.error(
        "   - Required columns: Source, Action, Date Imported, Destination"
      );
      console.error(
        "\nRun with URL_PROCESS_LIMIT=0 for more debugging information."
      );
      process.exit(1);
    }

    // Initialize stats
    stats.totalUrls = urls.length;

    // URLs are already sorted by priority from getUrlsFromSheet
    // Additional sort by hierarchy while maintaining priority order
    const priorityUrls = urls.filter((url) => url.processFirst);
    const nonPriorityUrls = urls.filter((url) => !url.processFirst);

    // Sort each group by hierarchy
    const priorityHierarchy = sortUrlsByHierarchy(priorityUrls);
    const nonPriorityHierarchy = sortUrlsByHierarchy(nonPriorityUrls);

    // Create a single urlsByLevel object combining both priority and non-priority
    const urlsByLevel = {};
    let maxLevel = Math.max(
      priorityHierarchy.maxLevel,
      nonPriorityHierarchy.maxLevel
    );

    // Populate the combined level map starting with priority URLs
    for (let level = 0; level <= maxLevel; level++) {
      urlsByLevel[level] = [];

      // Add priority URLs for this level first (if any)
      if (priorityHierarchy.urlsByLevel[level]) {
        urlsByLevel[level].push(...priorityHierarchy.urlsByLevel[level]);
      }

      // Then add non-priority URLs for this level
      if (nonPriorityHierarchy.urlsByLevel[level]) {
        urlsByLevel[level].push(...nonPriorityHierarchy.urlsByLevel[level]);
      }
    }

    // Flatten into a single array for backwards compatibility, though we'll use urlsByLevel directly
    const sortedUrls = [];
    for (let level = 0; level <= maxLevel; level++) {
      if (urlsByLevel[level]) {
        sortedUrls.push(...urlsByLevel[level]);
      }
    }

    // Pre-populate the page cache with data from the spreadsheet
    // This helps avoid "Missing Parents" issues when parents already exist
    await syncCacheWithSpreadsheet(sortedUrls);

    // Limit the number of URLs to process if needed
    if (URL_PROCESS_LIMIT > 0 && URL_PROCESS_LIMIT < sortedUrls.length) {
      console.log(
        `⚠️ Limiting processing to first ${URL_PROCESS_LIMIT} URLs of ${sortedUrls.length} total URLs`
      );

      // Limit while maintaining hierarchical integrity
      const limitedUrls = [];
      let count = 0;

      // Clear all levels first
      const originalUrlsByLevel = { ...urlsByLevel };
      for (let level = 0; level <= maxLevel; level++) {
        urlsByLevel[level] = [];
      }

      // Fill levels up to the limit
      for (
        let level = 0;
        level <= maxLevel && count < URL_PROCESS_LIMIT;
        level++
      ) {
        if (originalUrlsByLevel[level]) {
          const levelUrls = originalUrlsByLevel[level].slice(
            0,
            URL_PROCESS_LIMIT - count
          );

          if (levelUrls.length > 0) {
            limitedUrls.push(...levelUrls);
            urlsByLevel[level] = levelUrls;
            count += levelUrls.length;

            console.log(
              `  - Level ${level}: Added ${levelUrls.length} URLs (total: ${count}/${URL_PROCESS_LIMIT})`
            );
          }
        }
      }

      // Update the sortedUrls array for backwards compatibility
      sortedUrls.length = 0;
      sortedUrls.push(...limitedUrls);

      console.log(
        `📊 After limiting: Processing ${limitedUrls.length} URLs total`
      );

      // Update total for stats
      stats.totalUrls = limitedUrls.length;
    }

    console.log("\n📊 URL Processing Plan - Strict Hierarchical Order:");
    for (let level = 0; level <= maxLevel; level++) {
      if (urlsByLevel[level] && urlsByLevel[level].length > 0) {
        console.log(
          `\n📑 LEVEL ${level} URLS (${urlsByLevel[level].length} pages):`
        );
        urlsByLevel[level].forEach((url, index) => {
          const priority = url.processFirst ? "🔥 PRIORITY" : "  Regular";
          console.log(`  ${index + 1}. ${priority} ${url.computedUrl}`);
        });
      }
    }
    console.log("\n");

    let currentUrl = 0;
    const totalUrls = sortedUrls.length;
    // Clear the error files
    fs.writeFileSync(ERROR_URL_FILE, "");
    fs.writeFileSync(NOT_FOUND_URL_FILE, ""); // Initialize the 404 log file
    fs.writeFileSync(MISSING_PARENTS_FILE, ""); // Initialize the missing parents log file

    // Capture the start time
    const startTime = new Date();

    // Track URLs that didn't get uploaded due to missing parents
    const urlsMissingParents = [];

    // Process levels sequentially, completing each level before moving to the next
    const results = [];

    // Process URLs one level at a time with concurrency within each level
    const processLevelQueue = async () => {
      for (let level = 0; level <= maxLevel; level++) {
        if (!urlsByLevel[level] || urlsByLevel[level].length === 0) {
          console.log(`\n⏩ Skipping LEVEL ${level} - no URLs to process`);
          continue;
        }

        console.log(
          `\n🔄 PROCESSING LEVEL ${level} URLS (${urlsByLevel[level].length} pages):`
        );

        const levelUrls = [...urlsByLevel[level]]; // Create a copy to avoid modifying the original
        let levelSuccessCount = 0;
        let levelErrorCount = 0;
        let levelMissingParentsCount = 0;

        // Process this level with concurrency
        while (levelUrls.length > 0 && !isShuttingDown) {
          const activeRequests = [];

          while (
            activeRequests.length < CONCURRENCY_LIMIT &&
            levelUrls.length > 0 &&
            !isShuttingDown
          ) {
            const urlData = levelUrls.shift();
            activeRequests.push(
              fetchUrl(
                urlData.originalUrl,
                urlData.computedUrl,
                ++currentUrl,
                totalUrls
              )
                .then(async (result) => {
                  stats.addResult(result);

                  // Track level-specific statistics
                  if (result.pageId) {
                    levelSuccessCount++;
                  } else if (result.missingParent) {
                    levelMissingParentsCount++;
                  } else {
                    levelErrorCount++;
                  }

                  // Track URLs with missing parents
                  if (result.missingParent) {
                    urlsMissingParents.push(urlData.computedUrl);
                    // Log to missing parents file for later reprocessing
                    fs.appendFileSync(
                      MISSING_PARENTS_FILE,
                      `${urlData.computedUrl}\n`
                    );
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
                  levelErrorCount++;
                  console.error(
                    `Error processing ${urlData.computedUrl}:`,
                    error
                  );
                })
            );
            await new Promise((resolve) => setTimeout(resolve, CRAWL_DELAY_MS));
          }

          await Promise.all(activeRequests);
        }

        console.log(
          `\n✅ COMPLETED LEVEL ${level} URLS - Success: ${levelSuccessCount}, Errors: ${levelErrorCount}, Missing Parents: ${levelMissingParentsCount}`
        );
      }
    };

    // Start the processing of levels
    await processLevelQueue();

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

// Start the URL checking process if this is the main module
if (require.main === module) {
  checkUrls();
}

// Export the checkUrls function for use in reprocessMissingParents.js
module.exports = { checkUrls };
