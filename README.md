# HTML Content Extraction and WordPress Migration Tool

## Installation

```bash
npm install
```

## Configuration

1. Create a `.env` file with your WordPress credentials and other settings (see `.env.example`).
2. Configure the `src/config.js` file to match your requirements.

## Features

- Extracts HTML content from multiple URLs
- Processes images and uploads them to WordPress
- Handles page hierarchies automatically
- Transforms content to WordPress Gutenberg blocks
- Supports batch processing with concurrency limits
- Caches page information to reduce API calls

## Running

Create a txt file with one url per line. Run:

```bash
node index.js <file_with_urls>
```

`npm run migrate` is also available.

## Enhanced Page Hierarchy Handling

The tool now includes a robust page hierarchy system that:

1. Efficiently creates nested page structures in WordPress
2. Maintains proper parent-child relationships
3. Handles retries and error recovery
4. Caches page information to minimize API calls
5. Ensures pages are created in the correct order
6. **Strictly processes URLs by hierarchy level** - all level 1 pages are processed before level 2, etc.
7. Automatically logs pages with missing parents for later reprocessing

### Reprocessing Missing Parents

If some pages were skipped due to missing parents, you can reprocess them with:

```bash
node reprocessMissingParents.js
```

This will:

1. Read the `missing_parents.txt` file
2. Sort URLs by hierarchy level
3. Process them in strict hierarchical order
4. Create any missing intermediate pages

You can test the hierarchy handling with:

```bash
node testPageHierarchy.js
```

## Troubleshooting

If you encounter "Invalid URL" errors or other WordPress API issues, run the API connection diagnostic tool:

```bash
node checkWordPressApiConnection.js
```

This will test your WordPress connection and help diagnose common configuration issues.
