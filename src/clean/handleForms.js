function handleForms($) {
  // Handle <form> tags
  $("form").each((i, el) => {
    const action = $(el).attr("action");
    $(el).replaceWith(
      `<h2>🚨🚨🚨<br />Form found and needs updating: <br />${action}<br />${rootUrl}<br />🚨🚨🚨</h2>`
    );
  });
}

module.exports = { handleForms };
