function handleColumns($) {
  // Handle both paragraph__column, row-light-space, and Bootstrap row containers
  const columnContainers = $(".paragraph__column, .row-light-space, .row");
  if (columnContainers.length === 0) return;

  columnContainers.each((containerIndex, container) => {
    const $container = $(container);

    // Find all direct child divs that match any of these patterns:
    // 1. Classes containing "col" (for __3col, __2col, etc.)
    // 2. Bootstrap-style columns (col-md-*, col-sm-*, etc.)
    // 3. Regular column classes
    const columnDivs = $container.children('div[class*="col"]');

    if (columnDivs.length === 0) return;

    // Determine the layout based on the number of columns
    let layout;
    switch (columnDivs.length) {
      case 2:
        layout = "halves";
        break;
      case 3:
        layout = "thirds";
        break;
      case 4:
        layout = "quarters";
        break;
      default:
        layout = "single"; // Default to single for 1 column or other cases
    }

    // Create the new WordPress block structure
    let wpBlockHtml = `<!-- wp:wsuwp/row {"layout":"${layout}"} -->\n`;

    // Process each column
    columnDivs.each((i, columnDiv) => {
      const columnContent = $(columnDiv).html().trim();
      wpBlockHtml += `<!-- wp:wsuwp/column -->\n${columnContent}\n<!-- /wp:wsuwp/column -->\n`;
    });

    // Close the row block
    wpBlockHtml += `<!-- /wp:wsuwp/row -->\n\n`;

    // Replace the original container with the new WordPress block structure
    $container.replaceWith(wpBlockHtml);
  });
}

module.exports = { handleColumns };
