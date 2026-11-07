// The published syllabus shape: English camelCase keys in this order, with
// anything the parser does not recognise kept under `extra` by its original
// Chinese row label.
const LABEL_TO_FIELD = {
  教師姓名: "teacher",
  Email: "email",
  最後更新時間: "latestUpdate",
  課程大綱: "outline",
  課程進度: "schedule",
  評量方式與標準: "scorePolicy",
  "使用教材、參考書目或其他": "materials",
  課程諮詢管道: "consultation",
  備註: "remarks",
  延伸教學與資源: "resources",
  課程對應SDGs指標: "sdgs",
  課程是否導入AI: "aiUsage",
};

// Keys earlier crawls published, mapped to today's. The Chinese ones were
// themselves row labels, so they come from the label table.
const LEGACY_TO_FIELD = {
  name: "teacher",
  objective: "outline",
  延伸教學與資源: LABEL_TO_FIELD["延伸教學與資源"],
  課程對應SDGs指標: LABEL_TO_FIELD["課程對應SDGs指標"],
  課程是否導入AI: LABEL_TO_FIELD["課程是否導入AI"],
};

const TEXT_FIELDS = [
  "teacher",
  "email",
  "latestUpdate",
  "outline",
  "schedule",
  "scorePolicy",
  "materials",
  "consultation",
  "remarks",
  "resources",
  "sdgs",
  "aiUsage",
];

const FIELD_ORDER = [
  "teacher",
  "email",
  "officeHoursLink",
  "latestUpdate",
  "outline",
  "schedule",
  "scorePolicy",
  "materials",
  "consultation",
  "remarks",
  "resources",
  "sdgs",
  "aiUsage",
  "foreignLanguageTextbooks",
  "covid19",
  "extra",
];

const KNOWN_FIELDS = new Set(FIELD_ORDER);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Puts known fields in published order, fills the text fields APS leaves out
// with "", and drops optional fields that are absent or empty.
function orderSyllabusRecord(fields, extra = {}) {
  const ordered = {};
  for (const key of FIELD_ORDER) {
    if (key === "extra") {
      if (Object.keys(extra).length) ordered.extra = extra;
    } else if (fields[key] !== undefined) {
      ordered[key] = fields[key];
    } else if (TEXT_FIELDS.includes(key)) {
      ordered[key] = "";
    }
  }
  return ordered;
}

// Rewrites one published syllabus record of any vintage into the current
// shape. Already-migrated records come back equal, and a key present in both
// spellings keeps the current one.
function migrateSyllabusRecord(record) {
  if (!isPlainObject(record)) return record;
  const fields = {};
  const extra = isPlainObject(record.extra) ? { ...record.extra } : {};
  for (const [key, value] of Object.entries(record)) {
    if (key === "extra") continue;
    const field = LEGACY_TO_FIELD[key] ?? key;
    if (!KNOWN_FIELDS.has(field)) {
      extra[key] = value;
    } else if (field === key || fields[field] === undefined) {
      fields[field] = value;
    }
  }
  return orderSyllabusRecord(fields, extra);
}

module.exports = {
  LABEL_TO_FIELD,
  LEGACY_TO_FIELD,
  migrateSyllabusRecord,
  orderSyllabusRecord,
};
