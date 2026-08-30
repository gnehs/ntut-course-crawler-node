const pangu = require("pangu");
function spacing(text) {
  if (text) return pangu.spacingText(text);
  else return text;
}
exports.spacing = spacing;
