require("dotenv").config();
const { google } = require("googleapis");
const axios = require("axios");
const https = require("https");
const config = require("./src/config");
const {
  getAuthToken,
  SHEET_NAMES,
  RANGES,
  COLUMNS,
} = require("./src/updateGoogleSheet");
const { findPageBySlug } = require("./src/postToWordpress");
const { logMessage } = require("./src/utils/logs");
const { verifyParentHierarchy } = require("./src/utils/urls");
const { findPageByFullPath } = require("./src/utils/hierarchicalPageLookup");
const { findPageByLink } = require("./src/utils/findPageByLink");

const SHEET_ID = process.env.SHEET_ID;

// Define the column we'll use for menu (already exists as "MENU" in updateGoogleSheet.js)
const MENU_COLUMN = COLUMNS.MENU;

// Use the centralized API clients
const { wpApi, wpPublicApi } = require("./src/apiClients");

/**
 * Get menu items from the Google Sheet
 * @param {any} auth - The auth token
 * @returns {Promise<Array>} Array of menu items with their hierarchy information
 */
async function getMenuItemsFromSheet(auth) {
  console.log("Reading menu items from Google Sheet...");
  const service = google.sheets({ version: "v4", auth });

  try {
    logMessage(
      `Getting menu items from Google Sheet ID: ${SHEET_ID}`,
      config.paths.createMenuLogFile
    );

    console.log("Fetching data from sheet...");
    const request = {
      spreadsheetId: SHEET_ID,
      range: `'${SHEET_NAMES.DATA}'!${RANGES.ALL_COLUMNS}`,
      valueRenderOption: "UNFORMATTED_VALUE",
    };

    const response = await service.spreadsheets.values.get(request);
    const rows = response.data.values;

    if (!rows || !rows.length) {
      console.log("❌ No data found in sheet");
      return [];
    }

    console.log(`Found ${rows.length - 1} rows in sheet`);

    // Find required column indices
    const headers = rows[0];
    const menuColumnIndex = headers.findIndex(
      (header) => header === COLUMNS.MENU
    );
    const originalLinkColumnIndex = headers.findIndex(
      (header) => header === COLUMNS.ORIGINAL_LINK
    );
    const postIdColumnIndex = headers.findIndex(
      (header) => header === COLUMNS.POST_ID
    );

    if (menuColumnIndex === -1) {
      console.log(`❌ No "${COLUMNS.MENU}" column found in sheet`);
      return [];
    }

    console.log("Column indices found:", {
      [COLUMNS.MENU]: menuColumnIndex,
      [COLUMNS.ORIGINAL_LINK]: originalLinkColumnIndex,
      [COLUMNS.POST_ID]: postIdColumnIndex,
    });

    console.log("Processing menu items...");
    let validItems = 0;
    let skippedItems = 0;

    // Get items with menu information
    const menuItems = rows
      .slice(1) // Skip headers
      .filter((row) => {
        const hasMenuNumber =
          row[menuColumnIndex] && row[menuColumnIndex].toString().trim();
        const hasPostId = row[postIdColumnIndex];
        if (!hasMenuNumber || !hasPostId) {
          skippedItems++;
          return false;
        }
        validItems++;
        return true;
      })
      .map((row) => ({
        menuNumber: row[menuColumnIndex].toString().trim(),
        pageId: row[postIdColumnIndex],
        title: row[originalLinkColumnIndex] || "",
      }));

    console.log(`✓ Menu items processed:`);
    console.log(`  - Valid items: ${validItems}`);
    console.log(
      `  - Skipped rows (no menu number or post ID): ${skippedItems}`
    );

    logMessage(
      `Processed ${validItems} menu items (${skippedItems} rows skipped)`,
      config.paths.createMenuLogFile
    );

    return menuItems;
  } catch (error) {
    console.error("❌ Error reading from Google Sheet:", error.message);
    logMessage(
      `Error reading from Google Sheet: ${error.message}`,
      config.paths.createMenuLogFile
    );
    throw error;
  }
}

/**
 * Parse menu items into a hierarchical structure based on their numbering
 * @param {Array} menuItems - Array of menu items from sheet
 * @returns {Array} Array of menu items with parent-child relationships
 */
function parseMenuHierarchy(menuItems) {
  // Sort by menu number
  menuItems.sort((a, b) => {
    // Convert string numbers to actual numbers for comparison
    const aNum = parseFloat(a.menuNumber);
    const bNum = parseFloat(b.menuNumber);
    return aNum - bNum;
  });

  const menuStructure = [];
  const itemMap = new Map();

  menuItems.forEach((item) => {
    const menuNum = parseFloat(item.menuNumber);
    const isTopLevel = Number.isInteger(menuNum);

    // For non-top level items, determine the parent based on the numbering system
    // Example: parent of 1.2 is 1, parent of 2.3.1 would be 2.3
    let parentNum;
    if (isTopLevel) {
      parentNum = null;
    } else {
      parentNum = Math.floor(menuNum);
    }

    // Create the menu entry
    const menuEntry = {
      title: item.title,
      pageId: item.pageId,
      menuNumber: item.menuNumber,
      parentNumber: isTopLevel ? null : parentNum.toFixed(2),
      children: [],
    };

    // Store in map for quick lookup
    itemMap.set(menuNum.toFixed(2), menuEntry);

    if (isTopLevel) {
      // Top level item goes directly into the structure
      menuStructure.push(menuEntry);
    } else {
      // Child item - find parent and add to it
      const parent = itemMap.get(parentNum.toFixed(2));
      if (parent) {
        parent.children.push(menuEntry);
      } else {
        logMessage(
          `Parent menu item ${parentNum.toFixed(2)} not found for menu number ${
            item.menuNumber
          }, adding as top-level`,
          config.paths.createMenuLogFile
        );
        // If parent not found, add as top-level
        menuStructure.push(menuEntry);
      }
    }
  });

  return menuStructure;
}

/**
 * Create a WordPress menu with the given name
 * @param {string} menuName - Name for the new menu
 * @returns {Promise<number>} ID of the created menu
 */
async function createWordPressMenu(menuName) {
  try {
    // Append current date and time to menu name to make it unique
    const now = new Date();
    const formattedDate = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(
      now.getHours()
    ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const uniqueMenuName = `${menuName} - ${formattedDate}`;

    logMessage(
      `Creating WordPress menu: ${uniqueMenuName}`,
      config.paths.createMenuLogFile
    );

    // Try REST API endpoint first
    try {
      const menuData = {
        name: uniqueMenuName,
        description: "Menu created via REST API",
      };

      const response = await wpApi.post("/wp/v2/menus", menuData);
      logMessage(
        `Menu created via REST API with ID: ${response.data.id}`,
        config.paths.createMenuLogFile
      );
      return response.data.id;
    } catch (error) {
      logMessage(
        "REST API menu creation failed, trying admin-ajax.php...",
        config.paths.createMenuLogFile
      );

      // Fallback to admin-ajax.php
      const formData = new URLSearchParams();
      formData.append("action", "add-menu");
      formData.append("menu-name", uniqueMenuName);

      const response = await wpApi.post("/wp-admin/admin-ajax.php", formData, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      if (response.data.success) {
        logMessage(
          `Menu created via admin-ajax.php with ID: ${response.data.menu_id}`,
          config.paths.createMenuLogFile
        );
        return response.data.menu_id;
      } else {
        throw new Error("Failed to create menu via admin-ajax.php");
      }
    }
  } catch (error) {
    logMessage(
      `Error creating WordPress menu: ${error.message}`,
      config.paths.createMenuLogFile
    );
    throw error;
  }
}

/**
 * Get WordPress page ID and title by slug
 * @param {string} slug - Page slug to find
 * @returns {Promise<{id: number, title: string}|null>} Page ID and title or null if not found
 */
async function getPageIdBySlug(slug) {
  try {
    logMessage(
      `Looking for page with slug: ${slug}`,
      config.paths.createMenuLogFile
    );

    // Normalize slug by removing leading slashes
    const normalizedSlug = slug.replace(/^\/+/, "");

    // First, check if this is a top-level page or a hierarchical page
    const isHierarchical = normalizedSlug.includes("/");
    const topLevelSlug = isHierarchical
      ? normalizedSlug.split("/")[0]
      : normalizedSlug;

    // If this is a top-level menu item, ensure we get the correct top-level page
    if (!isHierarchical) {
      logMessage(
        `Looking for top-level page with slug: "${normalizedSlug}"`,
        config.paths.createMenuLogFile
      );

      // Get all pages with this slug
      const matchingPages = await wp
        .pages()
        .param("slug", normalizedSlug)
        .get();

      if (matchingPages && matchingPages.length > 0) {
        // Find a top-level page (parent id is 0)
        const topLevelPage = matchingPages.find((page) => page.parent === 0);

        if (topLevelPage) {
          logMessage(
            `Found top-level page with ID ${topLevelPage.id}, title "${topLevelPage.title.rendered}"`,
            config.paths.createMenuLogFile
          );
          return {
            id: topLevelPage.id,
            title: topLevelPage.title.rendered,
          };
        } else {
          logMessage(
            `Found ${matchingPages.length} pages with slug "${normalizedSlug}" but none are top-level (parent = 0)`,
            config.paths.createMenuLogFile
          );
        }
      } else {
        logMessage(
          `No pages found with slug "${normalizedSlug}"`,
          config.paths.createMenuLogFile
        );
      }
    }

    // For hierarchical paths, or if top-level lookup failed, use the hierarchical lookup
    logMessage(
      `Using hierarchical lookup for: "${normalizedSlug}"`,
      config.paths.createMenuLogFile
    );
    const pageInfo = await findPageByFullPath(normalizedSlug);

    if (pageInfo) {
      logMessage(
        `Found page with ID ${pageInfo.id}, title "${pageInfo.title}" using hierarchical lookup`,
        config.paths.createMenuLogFile
      );
      return pageInfo;
    }

    // If hierarchical lookup fails, try the legacy approach as fallback
    // But only for hierarchical paths - for top-level paths, we want to be more strict
    if (isHierarchical) {
      logMessage(
        `Hierarchical lookup failed for "${normalizedSlug}", trying fallback...`,
        config.paths.createMenuLogFile
      );

      // Get the last segment of the path
      const lastSegment = normalizedSlug.split("/").pop();

      if (lastSegment) {
        logMessage(
          `Looking for page with slug: ${lastSegment}`,
          config.paths.createMenuLogFile
        );
        const fallbackPageId = await findPageBySlug(lastSegment);

        if (fallbackPageId) {
          try {
            const response = await wpPublicApi.get(
              `/wp/v2/pages/${fallbackPageId}`
            );
            const fallbackPage = response.data;
            logMessage(
              `Found page with ID ${fallbackPageId} and title: ${fallbackPage.title.rendered} (fallback method)`,
              config.paths.createMenuLogFile
            );
            return {
              id: fallbackPageId,
              title: fallbackPage.title.rendered,
            };
          } catch (error) {
            logMessage(
              `Error getting fallback page details: ${error.message}`,
              config.paths.createMenuLogFile
            );
          }
        }
      }
    } else {
      // For top-level paths, log the failure but don't try the legacy fallback
      logMessage(
        `No top-level page found with slug: "${normalizedSlug}" - skipping legacy fallback`,
        config.paths.createMenuLogFile
      );
    }

    // Before giving up, try one more approach: find by exact link path
    // This is particularly useful for top-level pages
    logMessage(
      `Trying to find page by exact link path: "${normalizedSlug}"`,
      config.paths.createMenuLogFile
    );

    const linkPathPage = await findPageByLink(normalizedSlug);
    if (linkPathPage) {
      logMessage(
        `Found page by link path with ID ${linkPathPage.id}, title "${linkPathPage.title}"`,
        config.paths.createMenuLogFile
      );
      return linkPathPage;
    }

    logMessage(
      `No page found with slug: ${normalizedSlug}`,
      config.paths.createMenuLogFile
    );
    return null;
  } catch (error) {
    logMessage(
      `Error finding page with slug ${slug}: ${error.message}`,
      config.paths.createMenuLogFile
    );
    return null;
  }
}

/**
 * Fetch the title of a WordPress page by ID
 * @param {number} pageId - ID of the page
 * @returns {Promise<string|null>} Page title or null if not found
 */
async function getPageTitle(pageId) {
  try {
    const response = await wpApi.get(`/wp/v2/pages/${pageId}`);
    return response.data.title.rendered;
  } catch (error) {
    logMessage(
      `Error fetching title for page ID ${pageId}: ${error.message}`,
      config.paths.createMenuLogFile
    );
    return null;
  }
}

/**
 * Add menu items to a WordPress menu
 * @param {number} menuId - WordPress menu ID
 * @param {Array} menuStructure - Hierarchical menu structure
 * @param {number} parentId - Parent menu item ID (for recursive creation)
 * @returns {Promise<void>}
 */
async function addMenuItems(menuId, menuStructure, parentId = 0) {
  for (const item of menuStructure) {
    // Get the page title for this menu item
    const pageTitle = await getPageTitle(item.pageId);
    const displayTitle = pageTitle || item.title || `Menu Item ${item.menuNumber}`;

    logMessage(
      `Creating menu item: "${displayTitle}" (Page ID: ${item.pageId})`,
      config.paths.createMenuLogFile
    );

    try {
      // Prepare menu item data
      const menuItem = {
        title: displayTitle,
        menus: menuId,
        menu_order: parseInt(item.menuNumber.replace(/\./g, "")), // Convert "1.1" to 11 for ordering
        status: "publish",
        type: "post_type",
        object: "page",
        object_id: item.pageId,
      };

      if (parentId) {
        menuItem.parent = parentId;
      }

      logMessage(
        `Sending menu item data: ${JSON.stringify(menuItem)}`,
        config.paths.createMenuLogFile
      );

      const menuResponse = await wpApi.post("/wp/v2/menu-items", menuItem);
      const itemId = menuResponse.data.id;

      logMessage(
        `Created menu item "${displayTitle}" with ID: ${itemId}`,
        config.paths.createMenuLogFile
      );

      // Process child items
      if (item.children && item.children.length > 0) {
        logMessage(
          `Processing ${item.children.length} child items for "${displayTitle}"`,
          config.paths.createMenuLogFile
        );
        await addMenuItems(menuId, item.children, itemId);
      }
    } catch (error) {
      logMessage(
        `Error creating menu item "${displayTitle}": ${error.message}`,
        config.paths.createMenuLogFile
      );
      if (error.response?.data) {
        logMessage(
          `API Error [${error.response.status}]: ${JSON.stringify(error.response.data)}`,
          config.paths.createMenuLogFile
        );
      }
      // Continue with next item even if this one fails
      continue;
    }
  }
}

/**
 * Assign menu to a location
 * @param {number} menuId - WordPress menu ID
 * @param {string} location - Menu location (e.g., 'primary')
 * @returns {Promise<void>}
 */
async function assignMenuToLocation(menuId, location) {
  try {
    // Get available menu locations
    const locationsResponse = await wpApi.get(`/wp/v2/menu-locations`);

    // Check if the location exists
    const availableLocations = locationsResponse.data;
    // Check if availableLocations is an array before using includes()
    if (
      !Array.isArray(availableLocations) ||
      !availableLocations.includes(location)
    ) {
      logMessage(
        `Menu location "${location}" not found. Available locations: ${
          availableLocations?.join(", ") || "None"
        }`,
        config.paths.createMenuLogFile
      );
      logMessage("Trying alternate method...", config.paths.createMenuLogFile);

      // Try using theme_mods option
      try {
        const optionsResponse = await wpApi.get(`/wp/v2/settings`);

        // Extract existing theme_mods
        let settings = optionsResponse.data;
        if (!settings.theme_mods) {
          settings.theme_mods = {};
        }

        if (!settings.theme_mods.nav_menu_locations) {
          settings.theme_mods.nav_menu_locations = {};
        }

        // Set the menu for this location
        settings.theme_mods.nav_menu_locations[location] = menuId;

        // Update the setting
        await wpApi.post(`/wp/v2/settings`, {
          theme_mods: settings.theme_mods,
        });

        logMessage(
          `Assigned menu ID ${menuId} to ${location} location using theme_mods`,
          config.paths.createMenuLogFile
        );
        return;
      } catch (settingsError) {
        logMessage(
          `Error updating theme_mods: ${settingsError.message}`,
          config.paths.createMenuLogFile
        );
      }
    }

    logMessage(
      `Assigned menu ID ${menuId} to ${location} location`,
      config.paths.createMenuLogFile
    );
  } catch (error) {
    if (error.response && error.response.data) {
      logMessage(
        `Error assigning menu to location: ${JSON.stringify(
          error.response.data
        )}`,
        config.paths.createMenuLogFile
      );
    } else {
      logMessage(
        `Error assigning menu to location: ${error.message}`,
        config.paths.createMenuLogFile
      );
    }

    logMessage(
      "Unable to assign menu to location. You may need to do this manually in the WordPress admin.",
      config.paths.createMenuLogFile
    );
  }
}

/**
 * Main function to create a WordPress menu based on Google Sheet data
 * Each execution creates a new menu with a timestamp to ensure uniqueness
 */
async function createMenu() {
  try {
    console.log("Initializing menu creation process...");

    // Verify config paths
    console.log("Log file path:", config.paths.createMenuLogFile);
    if (!config.paths.createMenuLogFile) {
      throw new Error("Log file path is not configured");
    }

    // Check WordPress configuration
    console.log("Checking WordPress configuration...");
    if (!config.wordpress.apiBaseUrl) {
      throw new Error("WordPress API base URL is not configured");
    }
    if (!config.wordpress.username || !config.wordpress.password) {
      throw new Error("WordPress credentials are not configured");
    }

    logMessage(
      "Starting WordPress menu creation from Google Sheet...",
      config.paths.createMenuLogFile
    );

    console.log("Getting Google Sheets auth token...");
    // Get auth token for Google Sheets
    const auth = await getAuthToken();
    console.log("Got Google Sheets auth token");

    // Verify Sheet ID
    if (!SHEET_ID) {
      throw new Error("Google Sheet ID is not configured");
    }
    console.log("Using Google Sheet ID:", SHEET_ID);

    // Get menu items from sheet
    const menuItems = await getMenuItemsFromSheet(auth);
    console.log(`Found ${menuItems.length} menu items in the sheet`);

    if (menuItems.length === 0) {
      console.log("❌ No menu items found in the sheet. Process aborted.");
      logMessage(
        "No menu items found, exiting.",
        config.paths.createMenuLogFile
      );
      return;
    }

    // Parse the hierarchical structure
    console.log("Parsing menu hierarchy...");
    const menuStructure = parseMenuHierarchy(menuItems);
    console.log(
      `✓ Menu hierarchy parsed with ${menuStructure.length} top-level items`
    );

    logMessage(
      "Menu hierarchy parsed with structure:",
      config.paths.createMenuLogFile
    );
    logMessage(
      JSON.stringify(menuStructure, null, 2),
      config.paths.createMenuLogFile
    );

    // Create a WordPress menu with a unique name
    console.log("Creating WordPress menu...");
    const menuId = await createWordPressMenu("Primary Navigation");

    if (!menuId) {
      console.log(
        "❌ Failed to create WordPress menu. Check the logs for details."
      );
      logMessage(
        "Failed to create menu. Exiting.",
        config.paths.createMenuLogFile
      );
      return;
    }

    console.log(`✓ WordPress menu created successfully with ID: ${menuId}`);

    // Add menu items from the structure
    console.log("Adding menu items...");
    await addMenuItems(menuId, menuStructure);
    console.log("✓ Menu items added successfully");

    // Assign menu to primary location
    console.log("Assigning menu to primary location...");
    await assignMenuToLocation(menuId, "primary");
    console.log("✓ Menu assigned to primary location");

    console.log("\n✅ Menu creation completed successfully!");
    console.log(`Menu ID: ${menuId}`);
    console.log(`Items added: ${menuItems.length}`);
    console.log("You can view the menu in the WordPress admin panel");

    logMessage(
      "Menu creation completed successfully!",
      config.paths.createMenuLogFile
    );
  } catch (error) {
    console.log("\n❌ Error creating menu:");
    console.error(`${error.message}`);

    if (error.response) {
      console.error("API Response Details:");
      console.error(`Status: ${error.response.status}`);
      console.error(`Message: ${JSON.stringify(error.response.data, null, 2)}`);
    }

    console.log("\nTroubleshooting Tips:");
    console.log("1. Make sure WordPress REST API is enabled");
    console.log("2. Verify your WordPress credentials in .env file");
    console.log("3. Ensure the Main Menu column exists in your Google Sheet");
    console.log("4. Check if your WordPress theme supports menus");
    console.log("5. The WP API Menus plugin may be required");

    logMessage(
      `Error in menu creation: ${error.message}`,
      config.paths.createMenuLogFile
    );
    if (error.response) {
      logMessage(
        `Response status: ${error.response.status}`,
        config.paths.createMenuLogFile
      );
      logMessage(
        `Response data: ${JSON.stringify(error.response.data, null, 2)}`,
        config.paths.createMenuLogFile
      );
    }

    logMessage("\nTROUBLESHOOTING TIPS:", config.paths.createMenuLogFile);
    logMessage(
      "1. Make sure WordPress REST API is enabled",
      config.paths.createMenuLogFile
    );
    logMessage(
      "2. Verify your WordPress credentials in .env file",
      config.paths.createMenuLogFile
    );
    logMessage(
      "3. Ensure the 'Main Menu' column exists in your Google Sheet",
      config.paths.createMenuLogFile
    );
    logMessage(
      "4. Check if your WordPress theme supports menus and has the 'primary' location",
      config.paths.createMenuLogFile
    );
    logMessage(
      "5. Some WordPress installations may require the 'WP API Menus' plugin for full menu support",
      config.paths.createMenuLogFile
    );
  }
}

// Add error handler for uncaught promises
process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
  logMessage(
    `Unhandled promise rejection: ${error.message}`,
    config.paths.createMenuLogFile
  );
});

// Execute the menu creation
console.log("Starting menu creation process...");
createMenu().catch((error) => {
  console.error("Error in main execution:", error);
  logMessage(
    `Error in main execution: ${error.message}`,
    config.paths.createMenuLogFile
  );
});
