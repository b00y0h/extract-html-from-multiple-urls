const fs = require("fs");
const readline = require("readline");
const axios = require("axios");
const cheerio = require("cheerio");
const https = require("https");
const path = require("path");
const config = require("./src/config");
const {
  postToWordPress,
  updateParentPage,
  getParentPageSlug,
  processImage,
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
  totalUrls
) {
  console.log(`\n🔄 CONTENT PROCESSING START ---------------------`);
  console.log(`📝 Processing content for: ${computedUrl}`);

  if (!contentResponse) {
    // ...existing code for empty content...
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
    // Apply rate limiting for content fetching
    await sleep(config.crawler.crawlDelayMs);

    // For Create actions, we won't have an originalUrl
    if (!originalUrl) {
      console.log(`\n🚀 PROCESSING START (Create) -------------------------`);
      console.log(`📍 Processing URL ${currentUrl} of ${totalUrls}`);
      console.log(`🎯 Destination URL: ${computedUrl}`);

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
      const hierarchyResult = await verifyParentHierarchy(computedUrl);
      if (hierarchyResult === null) {
        console.log(`⚠️ Skipping ${computedUrl} - parent hierarchy incomplete`);
        console.log(`🚀 PROCESSING END -------------------------\n`);
        return { url: computedUrl, pageId: null };
      }
      console.log(`✅ Parent hierarchy verified`);

      // Process empty content for new page
      const result = await processContent(
        null,
        null,
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
    }

    console.log(`\n🚀 PROCESSING START -------------------------`);
    console.log(`📍 Processing URL ${currentUrl} of ${totalUrls}`);
    console.log(`🔗 Original URL: ${originalUrl}`);
    console.log(`🎯 Destination URL: ${computedUrl}`);

    // Configure axios to follow redirects and track them
    const axiosConfig = {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      headers: {
        "User-Agent": config.crawler.userAgent,
      },
      maxRedirects: 10,
      validateStatus: function (status) {
        return status >= 200 && status < 400;
      },
      maxRedirects: 5, // Limit redirects to prevent infinite loops
    };

    // Perform initial HEAD request to check for redirects
    console.log(`🔄 Checking for redirects...`);
    const headResponse = await axios
      .head(originalUrl, axiosConfig)
      .catch((e) => {
        console.log(`⚠️ HEAD request failed:`, e.message);
        return e.response;
      });

    const finalUrl = headResponse?.request?.res?.responseUrl || originalUrl;

    if (finalUrl !== originalUrl) {
      console.log(`⚠️ Redirect chain detected:`);
      console.log(`⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️ Original URL: ${originalUrl}`);
      console.log(`Final URL: ${finalUrl}`);

      // Verify if the redirect is expected
      if (!finalUrl.includes(originalUrl.replace(/\/$/, ""))) {
        console.log(`❌ WARNING: Unexpected redirect detected!`);
        console.log(`The page is redirecting to an unrelated URL.`);
        throw new Error(`Unexpected redirect to ${finalUrl}`);
      }
    }

    // Fetch content from the final URL
    console.log(`📥 Fetching content from final URL: ${finalUrl}`);
    const contentResponse = await axios.get(finalUrl, {
      ...axiosConfig,
      // Track redirects during the GET request
      beforeRedirect: (options, { headers }) => {
        console.log(`↪️ Redirecting to: ${options.href}`);
      },
    });

    // Verify the final URL matches what we expect
    const actualFinalUrl = contentResponse.request.res.responseUrl;
    if (actualFinalUrl !== finalUrl) {
      console.log(`❌ WARNING: GET request was redirected unexpectedly`);
      console.log(`Expected: ${finalUrl}`);
      console.log(`Actual: ${actualFinalUrl}`);
      throw new Error(
        `Unexpected redirect during GET request to ${actualFinalUrl}`
      );
    }

    console.log(`✅ Content fetched successfully from ${actualFinalUrl}`);

    // Get clean path segments, excluding the eab prefix
    const pathSegments = computedUrl
      .replace(/^(?:https?:\/\/)?(?:www\.)?[^/]+\//, "")
      .split("/")
      .filter(Boolean);

    const currentSlug = pathSegments[pathSegments.length - 1];
    console.log(`📚 Path segments:`, pathSegments);
    console.log(`🏷️  Current slug: ${currentSlug}`);

    // Verify entire parent hierarchy before proceeding
    console.log(`🔍 Verifying parent hierarchy...`);
    const hierarchyResult = await verifyParentHierarchy(computedUrl);
    if (hierarchyResult === null) {
      console.log(`⚠️ Skipping ${computedUrl} - parent hierarchy incomplete`);
      console.log(`🚀 PROCESSING END -------------------------\n`);
      return { url: computedUrl, pageId: null };
    }
    console.log(`✅ Parent hierarchy verified`);

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
