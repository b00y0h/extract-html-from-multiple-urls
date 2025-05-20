class ProcessingStats {
  constructor() {
    this.startTime = new Date();
    this.totalUrls = 0;
    this.processed = 0;
    this.successful = 0;
    this.errors = 0;
    this.urlsMissingParents = [];
    this.results = [];
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
    console.log(`Total URLs to process: ${this.totalUrls}`);
    console.log(`URLs processed: ${this.processed}`);
    console.log(`Pages successfully created: ${this.successful}`);
    console.log(`URLs with errors: ${this.errors}`);
    console.log(`URLs missing parents: ${this.urlsMissingParents.length}`);

    if (this.urlsMissingParents.length > 0) {
      console.log("\nURLs that didn't get uploaded due to missing parents:");
      this.urlsMissingParents.forEach((url) => console.log(`- ${url}`));
    }

    console.log("\n⏱️  Time Statistics:");
    if (elapsedMinutes > 0) {
      console.log(
        `Total processing time: ${elapsedMinutes}m ${elapsedSeconds}s`
      );
    } else {
      console.log(`Total processing time: ${elapsedSeconds}s`);
    }
    console.log("----------------------------------------\n");
  }
}

module.exports = { ProcessingStats };
