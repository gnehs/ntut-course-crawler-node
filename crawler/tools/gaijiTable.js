// APS stores NTUT's own glyphs (造字) as private-use code points and renders
// them with the school's MingGaiji webfont. They do not follow HKSCS, so each
// entry was matched by eye against that font. The school's table is fixed, so
// a code point means the same character in every semester.
// An empty string drops a code point that has no glyph even on the school site.
module.exports = {
  "": "峯",
  "": "琮",
  "": "雯",
  "": "煒",
  "": "温",
  "": "勳",
  "": "酶",
  "": "蒄",
  "": "免",
  // The glyph has the 示 radical, not 衣 (𬡥).
  "": "禎",
  "": "迪",
  // The glyph is 姉, not 姊.
  "": "姉",
  "": "晣",
  "": "",
};
