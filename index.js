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
// Load environment variables from a .env file if present
require("dotenv").config();

// Replace constants with config values
const ERROR_URL_FILE = config.paths.errorUrlFile;
const CONCURRENCY_LIMIT = config.crawler.concurrencyLimit;
const CRAWL_DELAY_MS = config.crawler.crawlDelayMs;
const USER_AGENT = config.crawler.userAgent;
const URL_PROCESS_LIMIT = config.crawler.urlProcessLimit;

// Sleep function for rate limiting
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  console.log(`🎯 Action: ${action}`);    if (!contentResponse || action === "Create") {
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
      const pageId = await postToWordPress(
        computedUrl,
        dummyContent,
        title
      );

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
      successfulMedia // Pass the processed media results
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
      .replace(/^(?:https?:\/\/)?(?:[^\/]+)/, "")
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
    const pageId = await postToWordPress(
      computedUrl,
      transformedToWPContent,
      pageTitle
    );

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
    console.log(`🔗 Original URL: ${typeof originalUrl === 'object' ? originalUrl.originalUrl : originalUrl}`);
    console.log(`🎯 Destination URL: ${computedUrl}`);
    console.log(`🎯 Action: ${typeof originalUrl === 'object' ? originalUrl.action : 'Move'}`);

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
      return { url: computedUrl, pageId: null };
    }
    console.log(`✅ Parent hierarchy verified`);

    // Check if the page already exists before attempting content fetch
    const existingPage = await findPageBySlug(currentSlug);
    if (existingPage) {
      console.log(
        `✨ Page already exists with ID ${existingPage}, skipping content processing`
      );
      return { url: computedUrl, pageId: existingPage };
    }

    // For Create action, skip content fetching
    const action = typeof originalUrl === 'object' ? originalUrl.action : 'Move';
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
        "User-Agent": config.crawler.userAgent,
      },
      maxRedirects: 10,
      validateStatus: function (status) {
        return status >= 200 && status < 400;
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

    // URLs are already sorted by priority from getUrlsFromSheet
    // Additional sort by hierarchy while maintaining priority order
    const priorityUrls = urls.filter((url) => url.processFirst);
    const nonPriorityUrls = urls.filter((url) => !url.processFirst);

    // Sort each group by hierarchy
    const sortedPriorityUrls = sortUrlsByHierarchy(priorityUrls);
    const sortedNonPriorityUrls = sortUrlsByHierarchy(nonPriorityUrls);

    // Combine the sorted groups
    urls = [...sortedPriorityUrls, ...sortedNonPriorityUrls];

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

// Start the URL checking process
checkUrls();
