require("dotenv").config();
const axios = require("axios");
const https = require("https");
const config = require("./src/config");

async function checkWordPressApiAuth() {
  console.log("============================================");
  console.log("WordPress API Authentication Check");
  console.log("============================================");

  // Check configuration
  console.log("\n1. CONFIGURATION CHECK:");
  console.log(`Base URL: ${config.wordpress.baseUrl}`);
  console.log(`API Base URL: ${config.wordpress.apiBaseUrl}`);
  console.log(`API Endpoint URL: ${config.wordpress.apiEndpointUrl}`);
  console.log(`Username: ${config.wordpress.username}`);
  console.log(
    `Password: ${
      config.wordpress.password
        ? "********" + config.wordpress.password.slice(-4)
        : "Not set"
    }`
  );

  if (!config.wordpress.baseUrl || !config.wordpress.apiBaseUrl) {
    console.error("❌ WordPress URLs are not configured properly");
    return;
  }

  if (!config.wordpress.username || !config.wordpress.password) {
    console.error("❌ WordPress credentials are not configured properly");
    return;
  }

  // 2. Basic site connectivity
  console.log("\n2. BASIC SITE CONNECTIVITY:");
  try {
    const basicResponse = await axios.get(config.wordpress.baseUrl, {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 10000,
      validateStatus: () => true,
    });

    console.log(`Status: ${basicResponse.status} ${basicResponse.statusText}`);
    if (basicResponse.status >= 200 && basicResponse.status < 400) {
      console.log("✅ WordPress site is reachable");
    } else {
      console.error(
        `❌ WordPress site returned error status: ${basicResponse.status}`
      );
    }
  } catch (error) {
    console.error(`❌ Cannot connect to WordPress site: ${error.message}`);
  }

  // 3. REST API availability
  console.log("\n3. REST API AVAILABILITY:");
  try {
    const apiUrl = `${config.wordpress.apiBaseUrl}/wp-json/`;
    console.log(`Testing endpoint: ${apiUrl}`);

    const restApiResponse = await axios.get(apiUrl, {
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 10000,
      validateStatus: () => true,
    });

    console.log(
      `Status: ${restApiResponse.status} ${restApiResponse.statusText}`
    );
    if (restApiResponse.status === 200) {
      console.log("✅ WordPress REST API is available");
    } else {
      console.error(
        `❌ WordPress REST API is not available (Status: ${restApiResponse.status})`
      );
    }
  } catch (error) {
    console.error(`❌ Cannot connect to WordPress REST API: ${error.message}`);
  }

  // 4. Authentication check
  console.log("\n4. AUTHENTICATION CHECK:");
  try {
    const base64Credentials = Buffer.from(
      `${config.wordpress.username}:${config.wordpress.password}`
    ).toString("base64");

    const authUrl = `${config.wordpress.apiBaseUrl}/wp-json/wp/v2/users/me`;
    console.log(`Testing authentication at: ${authUrl}`);
    console.log(`Using Basic Auth with username: ${config.wordpress.username}`);

    const authResponse = await axios.get(authUrl, {
      headers: {
        Authorization: `Basic ${base64Credentials}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 10000,
      validateStatus: () => true,
    });

    console.log(`Status: ${authResponse.status} ${authResponse.statusText}`);

    if (authResponse.status === 200) {
      console.log("✅ Authentication successful!");
      console.log(
        `Authenticated as: ${authResponse.data.name} (${authResponse.data.slug})`
      );
      console.log(`User roles: ${JSON.stringify(authResponse.data.roles)}`);

      if (
        authResponse.data.roles.includes("administrator") ||
        authResponse.data.roles.includes("editor") ||
        authResponse.data.roles.includes("author")
      ) {
        console.log(
          "✅ User has sufficient permissions to create/edit content"
        );
      } else {
        console.error(
          "❌ User lacks permissions to create/edit content. Need administrator, editor or author role."
        );
      }
    } else {
      console.error(
        `❌ Authentication failed (Status: ${authResponse.status})`
      );
      console.error("Response:", JSON.stringify(authResponse.data, null, 2));
    }
  } catch (error) {
    console.error(`❌ Authentication check failed: ${error.message}`);
    if (error.response) {
      console.error(
        `Status: ${error.response.status} ${error.response.statusText}`
      );
      console.error("Response:", JSON.stringify(error.response.data, null, 2));
    }
  }

  // 5. Page creation test
  console.log("\n5. PAGE CREATION TEST:");
  try {
    const base64Credentials = Buffer.from(
      `${config.wordpress.username}:${config.wordpress.password}`
    ).toString("base64");

    const testPageUrl = `${config.wordpress.apiBaseUrl}/wp-json/wp/v2/pages`;
    console.log(`Testing page creation at: ${testPageUrl}`);

    // Create a unique test page title with timestamp
    const testPageTitle = `Test Page ${new Date().toISOString()}`;

    const pageData = {
      title: testPageTitle,
      content:
        "This is a test page created to verify API access. You can delete this page.",
      status: "draft", // Create as draft so it doesn't appear on the site
    };

    console.log(`Creating test page with title: "${testPageTitle}"`);

    const createResponse = await axios.post(testPageUrl, pageData, {
      headers: {
        Authorization: `Basic ${base64Credentials}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 10000,
      validateStatus: () => true,
    });

    console.log(
      `Status: ${createResponse.status} ${createResponse.statusText}`
    );

    if (createResponse.status === 201) {
      console.log(
        `✅ Test page created successfully with ID: ${createResponse.data.id}`
      );
      console.log(
        `Test page edit URL: ${config.wordpress.baseUrl}/wp-admin/post.php?post=${createResponse.data.id}&action=edit`
      );
    } else {
      console.error(
        `❌ Test page creation failed (Status: ${createResponse.status})`
      );
      console.error("Response:", JSON.stringify(createResponse.data, null, 2));
    }
  } catch (error) {
    console.error(`❌ Page creation test failed: ${error.message}`);
    if (error.response) {
      console.error(
        `Status: ${error.response.status} ${error.response.statusText}`
      );
      console.error("Response:", JSON.stringify(error.response.data, null, 2));

      if (error.response.status === 403) {
        console.log("\nPOSSIBLE SOLUTIONS FOR 403 FORBIDDEN:");
        console.log(
          "1. Use an application password instead of your regular password"
        );
        console.log(
          "   - Go to WordPress admin → Users → Your Profile → Application Passwords"
        );
        console.log("   - Create a new application password for this script");
        console.log("   - Update your .env file with the new password");
        console.log(
          "2. Make sure your user has sufficient permissions (administrator, editor, or author)"
        );
        console.log(
          "3. Check if a security plugin like Wordfence is blocking API access"
        );
        console.log("4. Verify the REST API is enabled in WordPress settings");
      }
    }
  }

  console.log("\n============================================");
  console.log("Authentication Check Complete");
  console.log("============================================");
}

checkWordPressApiAuth();
