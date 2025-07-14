const { findPageByExactPath } = require("./src/utils/pathUtils");

async function testPathMatching() {
  console.log("\n[PATH MATCHING TEST CASES] ---------------------");

  // Test case 1: The case that was failing
  const test1 = {
    path: "/academics/nursing/programs",
    shouldNotMatchWith: "/academics/business/programs/",
  };

  // Test case 2: Another failing case
  const test2 = {
    path: "/academics/education/teacher-certification-programs/degree-program",
    shouldNotMatchWith: "/academics/education/doctoral/degree-program/",
  };

  // Test case 3: Similar paths that should be distinct
  const test3 = {
    path: "/about/departments/information-technology/services",
    shouldNotMatchWith: "/academics/library/services/",
  };

  const testCases = [test1, test2, test3];

  for (const test of testCases) {
    console.log(`\nTesting path: ${test.path}`);
    console.log(`Should NOT match with: ${test.shouldNotMatchWith}`);

    // First verify the exact path we want doesn't exist yet
    const result = await findPageByExactPath(test.path);

    if (result === null) {
      console.log("✅ PASS: Correctly returned null for non-existent path");
    } else {
      console.log("❌ FAIL: Found a page when it should not exist");
      console.log(`Found page ID: ${result}`);
    }

    // Now verify that the similar but different path is properly distinguished
    const similarResult = await findPageByExactPath(test.shouldNotMatchWith);

    if (similarResult !== null) {
      console.log(
        "✅ PASS: Similar but different path is properly distinguished"
      );
    } else {
      console.log("❌ FAIL: Similar path was not found when it should exist");
    }
  }
}

// Run the tests
testPathMatching().catch(console.error);
