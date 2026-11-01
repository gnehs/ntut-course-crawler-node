const GAIJI_TABLE = require("./gaijiTable");

const PRIVATE_USE_PATTERN = /[-]/gu;

function formatCodePoint(char) {
  return `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
}

// Replaces known gaiji with standard characters. Unknown private-use
// characters are kept so the gap stays visible, and handed to onUnknown with
// their surrounding text so they can be identified and added to the table.
function replaceGaiji(text, onUnknown) {
  if (!text) return text;
  return text.replace(PRIVATE_USE_PATTERN, (char, offset) => {
    if (Object.hasOwn(GAIJI_TABLE, char)) return GAIJI_TABLE[char];
    onUnknown?.({
      codePoint: formatCodePoint(char),
      context: text.slice(Math.max(0, offset - 10), offset + 11),
    });
    return char;
  });
}

// Normalises every text node and attribute of a loaded document, so each
// parser reads standard characters without handling gaiji itself.
function replaceGaijiInDocument($, onUnknown) {
  const visit = (node) => {
    if (node.type === "text") {
      node.data = replaceGaiji(node.data, onUnknown);
    }
    for (const [name, value] of Object.entries(node.attribs ?? {})) {
      node.attribs[name] = replaceGaiji(value, onUnknown);
    }
    node.children?.forEach(visit);
  };
  visit($.root()[0]);
  return $;
}

module.exports = { replaceGaiji, replaceGaijiInDocument };
