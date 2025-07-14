# Extract HTML from Multiple URLs Information

## Summary

A Node.js application designed to extract HTML content from multiple URLs, transform it into WordPress blocks, and post it to a WordPress site. The tool also handles image processing and maintains parent-child page hierarchies.

## Structure

- **src/**: Core application logic and utilities
  - **clean/**: HTML content cleaning and transformation modules
  - **utils/**: Helper functions for URLs, logging, and WordPress validation
- **wordpress/**: WordPress installation for local development
- **mysql/**: Database storage for local WordPress instance
- **config/**: Configuration files for PHP
- **images/**: Directory for storing downloaded images

## Language & Runtime

**Language**: JavaScript (Node.js)
**Version**: Node.js (version not specified)
**Package Manager**: npm/pnpm

## Dependencies

**Main Dependencies**:

- **axios**: HTTP client for making requests to URLs
- **cheerio**: HTML parsing and manipulation
- **dotenv**: Environment variable management
- **googleapis**: Google API client for spreadsheet integration
- **wpapi**: WordPress API client

## Build & Installation

```bash
npm install
# or
pnpm install
```

## Usage

```bash
# Process URLs from a file
node index.js <file_with_urls>

# Run with environment configuration
npm run migrate           # Staging environment
npm run migrate:staging   # Staging environment
npm run migrate:production # Production environment

# Create WordPress menu
npm run createMenu
```

## Docker

**Configuration**: Docker Compose setup with WordPress and MariaDB
**Services**:

- **wordpress**: WordPress container with PHP configuration
- **mysql**: MariaDB database container
- **wordpress-cli**: WP-CLI for WordPress management

**Run Command**:

```bash
docker-compose up -d
```

## Key Features

- Extracts HTML content from multiple URLs
- Transforms HTML into WordPress Gutenberg blocks
- Processes and uploads images to WordPress
- Maintains parent-child page hierarchies
- Integrates with Google Sheets for URL tracking
- Supports both staging and production environments

## Configuration

The application uses environment variables for configuration:

- WordPress API credentials
- Base URLs for staging and production
- API endpoints and rate limits

Configuration is managed through the `src/config.js` file and `.env` file (not included in repository).
