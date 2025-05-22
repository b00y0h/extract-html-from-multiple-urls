require("dotenv").config();
const {
  getAuthToken,
  updateSheetWithTimestamp,
} = require("./src/updateGoogleSheet");

async function testUpdate() {
  try {
    console.log("🧪 Testing Google Sheet update with Page ID...");

    // Get auth token
    const auth = await getAuthToken();
    console.log("✅ Auth token obtained");

    // Test row update with sample data
    // Replace with your test row index (0-based)
    const testRowIndex = 1;
    const testPageId = 12345;

    console.log(`Updating row ${testRowIndex + 1} with page ID: ${testPageId}`);
    const result = await updateSheetWithTimestamp(
      auth,
      testRowIndex,
      testPageId
    );

    console.log("✅ Update completed successfully");
    console.log("Response:", JSON.stringify(result.data, null, 2));
  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.response) {
      console.error("Error details:", error.response.data);
    }
  }
}

testUpdate();
