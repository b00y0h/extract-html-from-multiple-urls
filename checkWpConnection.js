require("dotenv").config();
const { validateWordPressConnection } = require("./src/postToWordpress");
const { validateWordPressComprehensive } = require("./src/utils/wpValidator");
const config = require("./src/config");
const axios = require("axios");
const https = require("https");

// Main function to validate WordPress connection
async function checkConnection() {
  console.log("========================================");
  console.log("   WORDPRESS CONNECTION VALIDATION      ");
  console.log("========================================");
  console.log(`Testing connection to: ${config.wordpress.apiBaseUrl}`);
  console.log(`Username: ${config.wordpress.username}`);
  console.log(
    `Password: ${config.wordpress.password ? "********" : "[NOT SET]"}`
  );
  console.log("----------------------------------------");

  try {
    console.log("Running comprehensive validation...");
    const validationResults = await validateWordPressComprehensive();

    if (validationResults.success) {
      console.log(
        "\n✅ VALIDATION PASSED: WordPress connection is valid and working correctly!"
      );

      if (validationResults.details.authCheck?.user) {
        console.log(
          `✓ Connected as: ${validationResults.details.authCheck.user.name}`
        );
        // Check if roles property exists and is an array before calling join
        if (
          validationResults.details.authCheck.user.roles &&
          Array.isArray(validationResults.details.authCheck.user.roles)
        ) {
          console.log(
            `✓ User roles: ${validationResults.details.authCheck.user.roles.join(
              ", "
            )}`
          );
        } else {
          console.log(`✓ User roles: Unknown`);
        }
      }

      console.log("\nYou can proceed with your migration scripts.");
    } else {
      console.error("\n❌ VALIDATION FAILED: WordPress connection has issues!");

      // Display detailed results
      if (!validationResults.details.configCheck.success) {
        console.error("\n🔧 Configuration Issues:");
        validationResults.details.configCheck.messages.forEach((msg) => {
          console.error(`  - ${msg}`);
        });
      }

      if (validationResults.details.urlCheck) {
        if (!validationResults.details.urlCheck.success) {
          console.error(
            `\n🌐 URL Reachability Issue: ${validationResults.details.urlCheck.message}`
          );
        } else {
          console.log(
            `✓ URL is reachable: ${validationResults.details.urlCheck.message}`
          );
        }
      }

      if (validationResults.details.restApiCheck) {
        if (!validationResults.details.restApiCheck.success) {
          console.error(
            `\n🔄 REST API Issue: ${validationResults.details.restApiCheck.message}`
          );
        } else {
          console.log(
            `✓ REST API is available: ${validationResults.details.restApiCheck.message}`
          );
        }
      }

      if (validationResults.details.authCheck) {
        if (!validationResults.details.authCheck.success) {
          console.error(
            `\n🔐 Authentication Issue: ${validationResults.details.authCheck.message}`
          );

          if (validationResults.details.authCheck.status === 403) {
            console.error("\n🔍 403 Forbidden Error Detected:");
            console.error("  This error typically occurs when:");
            console.error(
              "  - The credentials are correct but the user lacks sufficient permissions"
            );
            console.error("  - A security plugin is blocking API access");
            console.error(
              "  - Basic authentication is disabled on the WordPress instance"
            );
            console.error(
              "  - Application passwords might be required instead of regular passwords"
            );

            // Test for application password support
            console.log("\n🔐 Testing for application password support...");
            try {
              // Try a slightly different endpoint to check for different error messages
              const appPasswordCheck = await axios.get(
                `${config.wordpress.apiBaseUrl.replace(
                  /\/wp-json\/?$/,
                  ""
                )}/wp-json/wp/v2/users`,
                {
                  headers: {
                    "User-Agent": config.wordpress.userAgent,
                  },
                  auth: {
                    username: config.wordpress.username,
                    password: config.wordpress.password,
                  },
                  httpsAgent: new https.Agent({
                    rejectUnauthorized: false,
                  }),
                  timeout: 10000,
                  validateStatus: () => true,
                }
              );

              if (
                appPasswordCheck.status === 401 &&
                appPasswordCheck.data &&
                appPasswordCheck.data.code === "rest_cannot_authenticate"
              ) {
                console.log(
                  "✓ This WordPress instance appears to require application passwords."
                );
                console.log(
                  "  Suggestion: Create an application password in WordPress admin → Users → Profile."
                );
              }
            } catch (appPasswordError) {
              console.log(
                "❌ Could not determine application password requirements."
              );
            }

            // Check URL format
            if (!config.wordpress.apiBaseUrl.endsWith("/wp-json")) {
              console.error("\n⚠️ URL Format Issue:");
              console.error(
                `  Your API URL doesn't end with '/wp-json': ${config.wordpress.apiBaseUrl}`
              );
              console.error(
                "  Suggestion: Make sure your API URL looks like: https://your-wordpress-site.com/wp-json"
              );
            }
          }
        } else {
          console.log(
            `✓ Authentication successful: ${validationResults.details.authCheck.message}`
          );
        }
      }

      if (validationResults.details.permissionCheck) {
        if (!validationResults.details.permissionCheck.success) {
          console.error(
            `\n🔒 Permission Issue: ${validationResults.details.permissionCheck.message}`
          );
        } else {
          console.log(
            `✓ Permissions check passed: ${validationResults.details.permissionCheck.message}`
          );
        }
      }

      // Troubleshooting advice
      console.log("\n🔍 TROUBLESHOOTING SUGGESTIONS:");
      console.log("1. Check your .env file for correct credentials and URLs");
      console.log(
        "2. Verify that the WordPress REST API is enabled on your site"
      );
      console.log("3. Check if any security plugins are blocking API access");
      console.log(
        "4. Make sure your WordPress version supports the REST API (4.7+)"
      );
      console.log(
        "5. Try accessing the API endpoint in a browser: [WP_API_BASE_URL]/wp-json/"
      );
      console.log(
        "6. Try using application passwords instead of your regular password"
      );
      console.log("7. Verify your API user has sufficient permissions");
      console.log(
        "8. Check if there are any rate limits or IP restrictions in place"
      );

      // Add specific advice for 403 errors
      if (
        validationResults.details.authCheck &&
        validationResults.details.authCheck.status === 403
      ) {
        console.log("\n🔍 SPECIFIC ADVICE FOR 403 ERRORS:");
        console.log("1. Create an application password in WordPress admin:");
        console.log(
          "   - Go to Users → Profile → Application Passwords section"
        );
        console.log("   - Enter a name like 'Migration Script'");
        console.log("   - Click 'Add New Application Password'");
        console.log(
          "   - Copy the generated password and use it in your .env file"
        );
        console.log(
          "2. Check your WordPress site's .htaccess file for any restrictions"
        );
        console.log(
          "3. Try a different user account with administrator privileges"
        );
        console.log(
          "4. Temporarily disable security plugins like Wordfence, iThemes Security, etc."
        );
        console.log(
          "5. Make sure the REST API is not blocked by WordPress settings or plugins"
        );
      }
    }
  } catch (error) {
    console.error("\n❌ An error occurred during validation:");
    console.error(error.message);
    process.exit(1);
  }
}

// Run the validation
checkConnection();
