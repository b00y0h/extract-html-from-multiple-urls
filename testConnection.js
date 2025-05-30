// Test WordPress connection validation
const { validateWordPressConnection } = require('./src/postToWordpress');

async function testConnection() {
  try {
    console.log("Testing WordPress connection...");
    const result = await validateWordPressConnection();
    console.log("Connection test result:", result);
  } catch (error) {
    console.error("Connection test failed:", error.message);
  }
}

testConnection();
