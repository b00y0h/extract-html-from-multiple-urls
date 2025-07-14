class ProcessingStats {
  constructor() {
    this.startTime = new Date();
    this.totalUrls = 0;
    this.processed = 0;
    this.successful = 0;
    this.errors = 0;
    this.notFoundUrls = []; // Add array to track 404 errors
    this.urlsMissingParents = [];
    this.results = [];
    this.invalidParentPaths = new Set(); // Track paths with missing/invalid parents
    this.skippedChildPaths = new Set(); // Track paths skipped due to invalid parents
  }

  addInvalidParentPath(path) {
    // Normalize path by removing leading/trailing slashes
    const normalizedPath = path.replace(/^\/+|\/+$/g, "");
    this.invalidParentPaths.add(normalizedPath);
    return this; // Allow chaining
  }

  isChildOfInvalidParent(path) {
    // Normalize path by removing leading/trailing slashes
    const normalizedPath = path.replace(/^\/+|\/+$/g, "");

    // Check if any invalid parent path is a prefix of this path
    for (const invalidPath of this.invalidParentPaths) {
      if (normalizedPath.startsWith(invalidPath + "/")) {
        this.skippedChildPaths.add(normalizedPath);
        return true;
      }
    }
    return false;
  }

  addResult(result) {
    this.processed++;
    if (result.pageId) {
      this.successful++;
    } else {
      this.errors++;
    }

    // Track URLs with missing parents explicitly
    if (result.missingParent && result.url) {
      this.urlsMissingParents.push(result.url);
    }

    // Track 404 errors if provided
    if (result.status === 404) {
      this.notFoundUrls.push(result.url);
    }

    this.results.push(result);
  }

  generateReport(isInterrupted = false) {
    const endTime = new Date();
    const elapsedTimeMs = endTime - this.startTime;
    const elapsedMinutes = Math.floor(elapsedTimeMs / 60000);
    const elapsedSeconds = Math.floor((elapsedTimeMs % 60000) / 1000);
    const duration = (endTime - this.startTime) / 1000; // in seconds

    console.log("\n----------------------------------------");
    console.log(
      isInterrupted
        ? "🛑 Process interrupted - Final Report:"
        : "📊 Final Report:"
    );
    console.log("----------------------------------------");
    console.log(`Total URLs processed: ${this.processed}/${this.totalUrls}`);
    console.log(`Successful: ${this.successful}`);
    console.log(`Failed/Skipped: ${this.processed - this.successful}`);
    console.log(`Invalid parent paths: ${this.invalidParentPaths.size}`);
    console.log(`Skipped child paths: ${this.skippedChildPaths.size}`);
    console.log(`URLs missing parents: ${this.urlsMissingParents.length}`);
    console.log(`Time elapsed: ${elapsedMinutes}m ${elapsedSeconds}s`);
    console.log(
      `Success rate: ${((this.successful / this.processed) * 100).toFixed(2)}%`
    );

    // Add 404 error URLs to the report
    if (this.notFoundUrls.length > 0) {
      console.log("\n⚠️ URLs returning 404 (Not Found):");
      this.notFoundUrls.forEach((url, index) => {
        console.log(`${index + 1}. ${url}`);
      });
    }

    console.log("\nPath Processing Stats:");
    console.log(`Invalid Parent Paths: ${this.invalidParentPaths.size}`);
    console.log(`Skipped Child Paths: ${this.skippedChildPaths.size}`);
    if (this.invalidParentPaths.size > 0) {
      console.log("\nInvalid Parent Paths:");
      for (const path of this.invalidParentPaths) {
        console.log(`  - ${path}`);
      }
    }
    if (this.skippedChildPaths.size > 0) {
      console.log("\nSkipped Child Paths:");
      for (const path of this.skippedChildPaths) {
        console.log(`  - ${path}`);
      }
    }

    if (this.urlsMissingParents.length > 0) {
      console.log("\nURLs Missing Parents:");
      for (const url of this.urlsMissingParents) {
        console.log(`  - ${url}`);
      }
    }
  }
}

module.exports = { ProcessingStats };
