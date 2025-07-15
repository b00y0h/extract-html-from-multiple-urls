/**
 * WordPress API Connection Diagnostic Tool
 *
 * This script checks the WordPress API configuration and connection
 * to help diagnose issues with the WordPress API in the page hierarchy system.
 */

require("dotenv").config();
const { wpApi, wpPublicApi } = require("./src/apiClients");
const config = require("./src/config");

async function diagnoseWordPressConnection() {
  console.log("====================================================");
  console.log("WordPress API Connection Diagnostic Tool");
  console.log("====================================================");

  // 1. Check Configuration
  console.log("\n1. CHECKING CONFIGURATION:");
  console.log(`API Endpoint URL: ${config.wordpress.apiEndpointUrl}`);
  console.log(`Base URL: ${config.wordpress.baseUrl}`);
  console.log(`Username: ${config.wordpress.username}`);
  console.log(
    `Password: ${config.wordpress.password ? "******** (set)" : "NOT SET"}`
  );

  if (!config.wordpress.apiEndpointUrl) {
    console.error("❌ API Endpoint URL is not configured correctly!");
    console.log("Make sure your .env file has WP_API_BASE_URL set properly.");
    return;
  }

  // 2. Test Basic Connectivity
  console.log("\n2. TESTING BASIC CONNECTIVITY:");
  try {
    console.log(`Connecting to ${config.wordpress.apiEndpointUrl}...`);
    const response = await wpPublicApi.get("/");
    console.log("✅ Successfully connected to WordPress API!");
    console.log(`API Name: ${response.data?.name || "Unknown"}`);
    console.log(`API Description: ${response.data?.description || "None"}`);
    console.log(`API Version: ${response.data?.version || "Unknown"}`);
  } catch (error) {
    console.error("❌ Failed to connect to WordPress API!");
    console.error(`Error: ${error.message}`);

    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data: ${JSON.stringify(error.response.data)}`);
    }

    // Suggest potential fixes
    console.log("\nPOSSIBLE SOLUTIONS:");
    console.log("1. Check that the WordPress site is running and accessible");
    console.log("2. Verify the API URL is correct and includes /wp-json");
    console.log("3. Make sure the WordPress REST API is enabled");
    console.log(
      "4. Check for any security plugins that might be blocking access"
    );

    return;
  }

  // 3. Test Authentication
  console.log("\n3. TESTING AUTHENTICATION:");
  try {
    const response = await wpApi.get("/wp/v2/users/me");
    console.log("✅ Successfully authenticated!");
    console.log(`Logged in as: ${response.data.name}`);
    console.log(`User roles: ${response.data.roles?.join(", ") || "Unknown"}`);
  } catch (error) {
    console.error("❌ Authentication failed!");
    console.error(`Error: ${error.message}`);

    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data: ${JSON.stringify(error.response.data)}`);
    }

    // Suggest potential fixes
    console.log("\nPOSSIBLE SOLUTIONS:");
    console.log("1. Verify username and password are correct");
    console.log(
      "2. Try using an application password instead of your regular password"
    );
    console.log("3. Make sure the user has sufficient permissions");
    console.log(
      "4. Check for any security plugins that might be blocking authentication"
    );

    return;
  }

  // 4. Test Page Retrieval
  console.log("\n4. TESTING PAGE RETRIEVAL:");
  try {
    const response = await wpApi.get("/wp/v2/pages", {
      params: {
        per_page: 1,
      },
    });

    console.log("✅ Successfully retrieved pages!");
    console.log(`Number of pages retrieved: ${response.data.length}`);

    if (response.data.length > 0) {
      const page = response.data[0];
      console.log(`Sample page ID: ${page.id}`);
      console.log(`Sample page title: ${page.title.rendered}`);
      console.log(`Sample page slug: ${page.slug}`);
    }
  } catch (error) {
    console.error("❌ Failed to retrieve pages!");
    console.error(`Error: ${error.message}`);

    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data: ${JSON.stringify(error.response.data)}`);
    }

    return;
  }

  // 5. Test Page Creation (optional)
  console.log("\n5. WOULD YOU LIKE TO TEST PAGE CREATION? (Ctrl+C to abort)");
  console.log("Creating a test page in WordPress...");

  try {
    const testPageData = {
      title: "API Test Page " + new Date().toISOString(),
      content:
        "<!-- wp:paragraph --><p>This is a test page created by the diagnostic tool.</p><!-- /wp:paragraph -->",
      status: "draft", // Use draft status to avoid publishing test content
      slug: "api-test-page-" + Date.now(),
    };

    const response = await wpApi.post("/wp/v2/pages", testPageData);
    console.log("✅ Successfully created test page!");
    console.log(`Test page ID: ${response.data.id}`);
    console.log(`Test page status: ${response.data.status}`);
    console.log(`Test page link: ${response.data.link}`);

    // Optional cleanup
    console.log("\nCleaning up test page...");
    await wpApi.delete(`/wp/v2/pages/${response.data.id}`, {
      params: {
        force: true,
      },
    });
    console.log("✅ Test page deleted successfully");
  } catch (error) {
    console.error("❌ Failed to create/delete test page!");
    console.error(`Error: ${error.message}`);

    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error(`Data: ${JSON.stringify(error.response.data)}`);
    }

    console.log("\nPOSSIBLE SOLUTIONS:");
    console.log("1. Verify the user has permission to create pages");
    console.log("2. Make sure the REST API is not read-only");
    console.log(
      "3. Check for any security plugins that might be blocking write operations"
    );

    return;
  }

  // Success!
  console.log("\n====================================================");
  console.log("✅ ALL TESTS PASSED!");
  console.log("Your WordPress API connection is properly configured.");
  console.log("====================================================");
}

// Run the diagnostic
diagnoseWordPressConnection().catch((error) => {
  console.error("Fatal error:", error);
});
