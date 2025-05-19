const config = require("../config");
const { logMessage } = require("../utils/logs");

function handleForms($, rootUrl) {
  // Handle <form> tags
  $("form").each((i, el) => {
    const $form = $(el);
    const action = $form.attr("action");
    const method = $form.attr("method") || "get";
    const id = $form.attr("id") || "";
    const formFields = [];

    // Get all input fields
    $form.find("input, select, textarea").each((_, field) => {
      const $field = $(field);
      const fieldName = $field.attr("name");
      const fieldType =
        $field.attr("type") || $field.prop("tagName").toLowerCase();
      if (fieldName) {
        formFields.push(`${fieldType}: ${fieldName}`);
      }
    });

    // Create a detailed log entry
    const logEntry = [
      `\n=== FORM FOUND ===`,
      `Page URL: ${rootUrl}`,
      `Form Action: ${action}`,
      `Form Method: ${method}`,
      `Form ID: ${id}`,
      `Form Fields:`,
      ...formFields.map((field) => `  - ${field}`),
      `==================\n`,
    ].join("\n");

    // Log form information using the logMessage utility
    logMessage(logEntry, config.paths.formLogFile);

    // Replace the form with a warning message
    $(el).replaceWith(
      `<h2>🚨🚨🚨<br />Form found and needs updating: <br />${action}<br />${rootUrl}<br />🚨🚨🚨</h2>`
    );
  });
}

module.exports = { handleForms };
