const WPAPI = require("wpapi");

const config = require("./src/config");

// Initialize the WordPress API client
const wp = new WPAPI({
  endpoint: config.wordpress.apiBaseUrl,
  username: config.wordpress.username,
  password: config.wordpress.password,
});

async function checkParents(slug, action) {
  var pages = await wp.pages().slug("about");
  console.log("🚀 ~ checkParents ~ pages:", pages);
}

checkParents();
