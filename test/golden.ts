/**
 * The golden keystroke corpus, as data.
 *
 * Kept out of the test file so that both the test suite and the docs check can
 * count the same corpus: the counts a README claims are then derived from the
 * corpus itself rather than hand-maintained in prose.
 *
 * Each entry is `[physical keys, expected Tamil]`. Tamil99 keys are literal
 * characters; phonetic keys are the romanisation the jquery.ime port expects.
 */

export type Golden = [keys: string, want: string];

/** Tamil99 — modifier keys, dead keys, grantha, and the auto-pulli. */
export const GOLDEN_TAMIL99: Golden[] = [
  ["h", "க"],
  ["hh", "க்க"],
  ["hhh", "க்கக"],
  ["hf", "க்"],
  ["hq", "கா"],
  ["ha", "க"],
  ["hqi", "கான"],
  ["kf", "ம்"],
  ["jf", "ப்"],
  ["bf", "ங்"],
  ["bh", "ங்க"],
  [";l", "ந்த"],
  ["kj", "ம்ப"],
  ["Y", "க்ஷ"],
  ["T", "ஸ்ரீ"],
  ["I", "ஶ்ரீ"],
  ["F", "ஃ"],
  ["lks/f", "தமிழ்"],
  ["vphhkf", "வணக்கம்"],
  [";ifus", "நன்றி"],
  ["akmf", "அமர்"],
];

/** Phonetic transliteration — the ordered rewrite rules ported from jquery.ime. */
export const GOLDEN_TRANSLIT: Golden[] = [
  ["vaNakkam", "வணக்கம்"],
  ["thamiz", "தமிழ்"],
  ["kaN", "கண்"],
  ["peyar", "பெயர்"],
  ["wanRi", "நன்றி"],
  ["sari", "சரி"],
  ["mozi", "மொழி"],
  ["ksHayam", "க்ஷயம்"],
  ["Sri", "ஸ்ரீ"],
];

export const GOLDEN_TOTAL = GOLDEN_TAMIL99.length + GOLDEN_TRANSLIT.length;
