const { removeSpecificTags } = require("./removeSpecificTags");
const { removeComments } = require("./removeComments");
const { cleanUpContent } = require("./cleanUpContent");
const { handleBlockquotes } = require("./handleBlockquotes");
const { handleIframes } = require("./handleIframes");
const { handleParagraphs } = require("./handleParagraphs");
const { replaceSpans } = require("./replaceSpans");
const { wrapVideoContainers } = require("./wrapVideoContainers");
const { handleHorizontalRules } = require("./handleHorizontalRules");
const { handleTables } = require("./handleTables");
const { handleLists } = require("./handleLists");
const { handleHeadings } = require("./handleHeadings");
const { handleButtons } = require("./handleButtons");
const { handleForms } = require("./handleForms");
const { handleImages } = require("./handleImages");
const { removeScripts } = require("./removeScripts");
const { handleImageLinks } = require("./handleImageLinks");
const { handleSocialLinks } = require("./handleSocialLinks");
const { handleAccordions } = require("./handleAccordions");
const { handleColumns } = require("./handleColumns");

module.exports = {
  removeSpecificTags,
  removeComments,
  cleanUpContent,
  handleBlockquotes,
  handleIframes,
  handleParagraphs,
  replaceSpans,
  wrapVideoContainers,
  handleHorizontalRules,
  handleTables,
  handleLists,
  handleHeadings,
  handleButtons,
  handleForms,
  handleImages,
  removeScripts,
  handleImageLinks,
  handleSocialLinks,
  handleAccordions,
  handleColumns,
};
