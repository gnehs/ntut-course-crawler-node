const pangu = require("pangu");
function spacing(text) {
  if (text) return pangu.spacing(text);
  else return text;
}
exports.spacing = spacing;
