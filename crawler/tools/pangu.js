const pangu = require("pangu");

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/giu;

function spacing(text) {
  if (!text) return text;

  // pangu treats URL punctuation as prose when a URL shares a string with CJK,
  // which can insert spaces into percent escapes and query parameters.
  let result = "";
  let lastIndex = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    result += pangu.spacingText(text.slice(lastIndex, match.index));
    result += match[0];
    lastIndex = match.index + match[0].length;
  }
  result += pangu.spacingText(text.slice(lastIndex));
  return result;
}

exports.spacing = spacing;
