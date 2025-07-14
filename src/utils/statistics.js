class ProcessingStats {
  constructor() {
    this.startTime = new Date();
    this.totalUrls = 0;
    this.processed = 0;
    this.successful = 0;
    this.errors = 0;
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
    }
    if (!result.pageId && result.url) {
      this.urlsMissingParents.push(result.url);
    }
    this.results.push(result);
  }

  generateReport(isInterrupted = false) {
    const endTime = new Date();
    const elapsedTimeMs = endTime - this.startTime;
    const elapsedMinutes = Math.floor(elapsedTimeMs / 60000);
    const elapsedSeconds = Math.floor((elapsedTimeMs % 60000) / 1000);

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
