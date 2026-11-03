const ARTICLE_NUMBERS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const PLAN_PURPOSE_PATTERN = /宗旨(?:\/?教學目標)?(.+?)課程規劃/;
const MAX_PLAN_PURPOSE_LENGTH = 500;
const NON_PURPOSE_SENTENCE = /依據|訂定|皆得修讀|選修人數/;
const CREDIT_CLAUSE = /學分|應修習/;
const SHORT_NAME_PARENTHETICAL = /[(（][^()（）]*以下簡稱[^()（）]*[)）]/g;

// PDF extractors break lines anywhere, so whitespace next to a non-ASCII
// character carries no meaning and is removed.
function normalizeRulesText(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .replace(/(?<=[^\x00-\x7F]) +| +(?=[^\x00-\x7F])/g, "")
    .trim();
}

// Articles are numbered 一、二、三… in order, so look for each marker after
// the previous one instead of splitting on every "十、"-like sequence.
function splitArticles(text) {
  const markers = [];
  let from = 0;
  for (let n = 1; n <= 40; n += 1) {
    const label = articleLabel(n);
    const index = text.indexOf(`${label}、`, from);
    if (index === -1) break;
    markers.push({ index, bodyStart: index + label.length + 1 });
    from = index + label.length + 1;
  }
  return markers.map((marker, i) =>
    text.slice(marker.bodyStart, markers[i + 1]?.index ?? text.length)
  );
}

function articleLabel(n) {
  if (n <= 10) return ARTICLE_NUMBERS[n - 1];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${tens > 1 ? ARTICLE_NUMBERS[tens - 1] : ""}十${ones ? ARTICLE_NUMBERS[ones - 1] : ""}`;
}

function purposeOfArticle(article) {
  const sentences = article
    .split("。")
    .filter((sentence) => sentence && !NON_PURPOSE_SENTENCE.test(sentence));
  const kept = [];
  for (const sentence of sentences) {
    const clauses = sentence
      .replace(SHORT_NAME_PARENTHETICAL, "")
      .split("，")
      .filter((clause) => clause && !CREDIT_CLAUSE.test(clause));
    if (clauses.length) kept.push(`${clauses.join("，")}。`);
  }
  return kept.join("").replace(/。{2,}/g, "。");
}

function planPurposeOf(normalized) {
  const purpose = normalized.match(PLAN_PURPOSE_PATTERN)?.[1].trim();
  return purpose && purpose.length <= MAX_PLAN_PURPOSE_LENGTH ? purpose : null;
}

function parseIntro(text) {
  const normalized = normalizeRulesText(text);

  let intro = null;
  for (const article of splitArticles(normalized)) {
    const purpose = purposeOfArticle(article);
    if (purpose) {
      intro = purpose;
      break;
    }
  }
  return intro ?? planPurposeOf(normalized);
}

module.exports = { parseIntro };
