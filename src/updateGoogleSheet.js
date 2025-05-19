const { google } = require("googleapis");
const path = require("path");

// Configuration constants
const KEYFILEPATH = path.join(process.cwd(), "service-account-key.json");
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const SHEET_ID = process.env.SHEET_ID;

// Sheet names
const SHEET_NAMES = {
  DATA: "Data",
};

// Column names
const COLUMNS = {
  ORIGINAL_LINK: "Source",
  ACTION: "Action",
  DATE_IMPORTED: "Date Imported",
  COMPUTED_URL_FORMULA: "Destination",
  WORDPRESS_LINK: "Wordpress Link",
};

// Action values
const ACTION_VALUES = {
  MOVE: "Move",
  CREATE: "Create",
};

// Range constants
const RANGES = {
  ALL_COLUMNS: "A1:P",
  HEADERS: "A1:P1",
};

async function getAuthToken() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEYFILEPATH,
    scopes: SCOPES,
  });
  const authToken = await auth.getClient();
  return authToken;
}

async function appendToSheet(auth) {
  const service = google.sheets({ version: "v4", auth });

  const request = {
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAMES.DATA}!A:A`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    resource: {
      values: [["Value1", "Value2", "Value3"]],
    },
  };

  try {
    const response = await service.spreadsheets.values.append(request);
    console.log(`${response.data.updates.updatedRows} rows appended.`);
    return response;
  } catch (err) {
    console.error("The API returned an error:", err);
    throw err;
  }
}

async function getUrlsFromSheet(auth) {
  const service = google.sheets({ version: "v4", auth });

  try {
    const request = {
      spreadsheetId: SHEET_ID,
      range: `'${SHEET_NAMES.DATA}'!${RANGES.ALL_COLUMNS}`,
      valueRenderOption: "UNFORMATTED_VALUE",
    };

    const response = await service.spreadsheets.values.get(request);
    const rows = response.data.values;

    if (!rows || !rows.length) {
      console.log("No data found in the sheet.");
      return [];
    }

    const headers = rows[0];
    const originalLinkColumnIndex = headers.findIndex(
      (header) => header === COLUMNS.ORIGINAL_LINK
    );
    const actionColumnIndex = headers.findIndex(
      (header) => header.trim() === COLUMNS.ACTION
    );
    const dateImportedColumnIndex = headers.findIndex(
      (header) => header.trim() === COLUMNS.DATE_IMPORTED
    );
    const computedUrlFormulaColumnIndex = headers.findIndex(
      (header) => header === COLUMNS.COMPUTED_URL_FORMULA
    );

    console.log("Column indexes found:", {
      [COLUMNS.ORIGINAL_LINK]: originalLinkColumnIndex,
      [COLUMNS.ACTION]: actionColumnIndex,
      [COLUMNS.DATE_IMPORTED]: dateImportedColumnIndex,
      [COLUMNS.COMPUTED_URL_FORMULA]: computedUrlFormulaColumnIndex,
    });

    if (
      originalLinkColumnIndex === -1 ||
      actionColumnIndex === -1 ||
      dateImportedColumnIndex === -1 ||
      computedUrlFormulaColumnIndex === -1
    ) {
      throw new Error("Required columns not found");
    }

    const filteredRows = rows.slice(1).filter((row, index) => {
      const action = row[actionColumnIndex]?.trim();
      const url = row[computedUrlFormulaColumnIndex];
      const dateImported = row[dateImportedColumnIndex];

      if (action === ACTION_VALUES.MOVE) {
        return url && !dateImported;
      } else if (action === ACTION_VALUES.CREATE) {
        return !dateImported;
      }
      return false;
    });

    console.log(`Total filtered rows: ${filteredRows.length}`);

    const urlsWithRows = filteredRows.map((row, index) => ({
      originalUrl: row[originalLinkColumnIndex],
      computedUrl: row[computedUrlFormulaColumnIndex],
      rowNumber: rows.indexOf(row), // This gets the actual row number in the sheet
    }));

    console.log(`Number of URLs returned: ${urlsWithRows.length}`);
    return urlsWithRows;
  } catch (err) {
    console.error("Error accessing sheet:", err);
    if (err.response) {
      console.error("Error details:", err.response.data);
    }
    throw err;
  }
}

async function updateSheetWithTimestamp(auth, rowIndex, pageId) {
  const service = google.sheets({ version: "v4", auth });

  try {
    const headerRequest = {
      spreadsheetId: SHEET_ID,
      range: `'${SHEET_NAMES.DATA}'!${RANGES.HEADERS}`,
      valueRenderOption: "UNFORMATTED_VALUE",
    };

    const headerResponse = await service.spreadsheets.values.get(headerRequest);
    const headers = headerResponse.data.values[0];
    const dateImportedColumnIndex = headers.findIndex(
      (header) => header.trim() === COLUMNS.DATE_IMPORTED
    );
    const wordpressLinkColumnIndex = headers.findIndex(
      (header) => header.trim() === COLUMNS.WORDPRESS_LINK
    );

    if (dateImportedColumnIndex === -1) {
      throw new Error(`Column '${COLUMNS.DATE_IMPORTED}' not found`);
    }
    if (wordpressLinkColumnIndex === -1) {
      throw new Error(`Column '${COLUMNS.WORDPRESS_LINK}' not found`);
    }

    const dateColumnLetter = String.fromCharCode(65 + dateImportedColumnIndex);
    const wordpressLinkColumnLetter = String.fromCharCode(
      65 + wordpressLinkColumnIndex
    );

    // Format the date
    const now = new Date();
    const formattedDate = now
      .toLocaleDateString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
      .replace(",", "");

    const wordpressLink = `https://wsuwp.vancouver.wsu.edu/eab/wp-admin/post.php?post=${pageId}&action=edit`;

    const request = {
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAMES.DATA}!${dateColumnLetter}${
        rowIndex + 1
      }:${wordpressLinkColumnLetter}${rowIndex + 1}`,
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [[formattedDate, wordpressLink]],
      },
    };

    const response = await service.spreadsheets.values.update(request);
    console.log(
      `Row ${
        rowIndex + 1
      } updated with timestamp in column ${dateColumnLetter} and WordPress link in column ${wordpressLinkColumnLetter}.`
    );
    return response;
  } catch (err) {
    console.error("Error updating sheet:", err);
    throw err;
  }
}

module.exports = {
  getAuthToken,
  appendToSheet,
  getUrlsFromSheet,
  updateSheetWithTimestamp,
};
