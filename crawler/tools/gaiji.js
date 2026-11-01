const GAIJI_TABLE = require("./gaijiTable");

const PRIVATE_USE_PATTERN = /[\uE000-\uF8FF]/gu;

// Words the school's own text gets wrong outside the private-use area, where
// an older encoding swapped or dropped a character. Each pattern matches only
// the misspelling, so correct text never changes.
const SOURCE_CORRECTIONS = [
  // 103–109 學年 encode 簡媜 as 簡勠.
  [/簡勠/gu, "簡媜"],
  // 110–115 學年下學期 drop 媜 from this book.
  [/簡(?=《誰在銀閃閃的地方)/gu, "簡媜"],
];

function formatCodePoint(char) {
  return `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
}

// Replaces known gaiji with standard characters. Unknown private-use
// characters are kept so the gap stays visible, and handed to onUnknown with
// their surrounding text so they can be identified and added to the table.
function replaceGaiji(text, onUnknown) {
  if (!text) return text;
  const replaced = text.replace(PRIVATE_USE_PATTERN, (char, offset) => {
    if (Object.hasOwn(GAIJI_TABLE, char)) return GAIJI_TABLE[char];
    onUnknown?.({
      codePoint: formatCodePoint(char),
      context: text.slice(Math.max(0, offset - 10), offset + 11),
    });
    return char;
  });
  return SOURCE_CORRECTIONS.reduce(
    (result, [pattern, correction]) => result.replace(pattern, correction),
    replaced
  );
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
