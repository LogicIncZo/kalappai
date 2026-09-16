
/* ============================================================================
   KALAPPAI (கலப்பை) — Tamil-first typing tutor · ENGINE + LAYOUT IR
   Tamil99 · InScript · Tamil Typewriter (TamilNet'99) · Phonetic (translit)

   Spec:
   ThamizhKanimai/input-methods/tamil-typing-tutor/{REQUIREMENTS,SPECIFICATIONS}.md

   Core claim: the browser owns the keystroke. The learner installs no OS
   keyboard. Physical keys are read via event.code and passed through the
   layout's own rule machine, so the same page teaches three incompatible
   layouts.
   ========================================================================== */

/* eslint-disable */

/* ---------- Tamil primitives ---------- */

const PULLI = "\u0BCD";
const ZWNJ = "\u200C";

const CONSONANTS = "கஙசஞடணதநபமயரலவழளறனஸஷஜஹஶ";
const GRANTHA = "ஸஷஜஹஶ";
const INDEPENDENT = "அஆஇஈஉஊஎஏஐஒஓஔ";
const VOWEL_SIGNS = "ாிீுூெேைொோௌ";
const PREBASE_SIGNS = "ெேைொோௌ";
const TAMIL_DIGITS = "௦௧௨௩௪௫௬௭௮௯";
const TAMIL_SYMBOLS = "௳௴௵௶௷௸௹௺";

const isConsonant = (c: string) => c.length > 0 && CONSONANTS.includes(c);
const isIndependent = (c: string) => c.length > 0 && INDEPENDENT.includes(c);
const isBase = (c: string) => isConsonant(c) || isIndependent(c);

/** Last committed codepoint, or "" — never let "".includes() decide anything. */
const lastChar = (s: string) => (s.length ? s.slice(-1) : "");

/** Split Tamil text into aksharas (grapheme clusters).
 *  A pulli binds forward, so க்ஷ / ஸ்ரீ stay single units. */
export function aksharas(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const ch of text) {
    if (isBase(ch) && !cur.endsWith(PULLI)) {
      if (cur) out.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export const nfc = (s: string) => s.normalize("NFC");

/* ---------- Layout IR ---------- */

export type LayoutId = "tamil99" | "inscript" | "typewriter" | "translit";

type KeyMap = Record<string, [string, string?]>; // [base, shift]

export type Layout = {
  id: LayoutId;
  name: string;
  tamilName: string;
  blurb: string;
  engine: "tamil99" | "stateless" | "translit";
  keys: KeyMap;
  source: string;
  sourceUrl: string;
  license: string;
  /** Documented divergences between the two reference implementations. */
  divergences: string[];
};

/* --- Tamil99: Keyman thamizha_tamil99_ext v2.2.1, read rule-by-rule --- */
const TAMIL99: Layout = {
  id: "tamil99",
  name: "Tamil99",
  tamilName: "தமிழ்99",
  blurb: "Tamil Nadu's standard keyboard. One key per akshara — sounds, not shapes.",
  engine: "tamil99",
  keys: {
    KeyA: ["அ", "௹"], KeyQ: ["ஆ", "ஸ"], KeyS: ["இ", "௺"], KeyW: ["ஈ", "ஷ"],
    KeyD: ["உ", "௸"], KeyE: ["ஊ", "ஜ"], KeyG: ["எ", ""], KeyT: ["ஏ", "ஸ்ரீ"],
    KeyR: ["ஐ", "ஹ"], KeyC: ["ஒ", "௵"], KeyX: ["ஓ", "௴"], KeyZ: ["ஔ", "௳"],
    KeyH: ["க", ""], KeyB: ["ங", "௷"], BracketLeft: ["ச", ""], BracketRight: ["ஞ", ""],
    KeyO: ["ட", "["], KeyP: ["ண", "]"], KeyL: ["த", ":"], Semicolon: ["ந", ";"],
    KeyJ: ["ப", ""], KeyK: ["ம", "\""], Quote: ["ய", "'"], KeyM: ["ர", "/"],
    KeyN: ["ல", ""], KeyV: ["வ", "௶"], Slash: ["ழ", ""], KeyY: ["ள", "க்ஷ"],
    KeyU: ["ற", "ஶ"], KeyI: ["ன", "ஶ்ரீ"], KeyF: ["ஃ", "ஃ"],
    Backquote: ["^", "~"],
  },
  source: "Keyman thamizha_tamil99_ext v2.2.1 (.kmn, read rule-by-rule)",
  sourceUrl: "https://github.com/keymanapp/keyboards/tree/master/release/t/thamizha_tamil99_ext",
  license: "MIT © thamizha.com and SIL Global",
  divergences: [
    "f after a consonant = ் (pulli). f with no consonant before it = ஃ (aytham) in thamizha ext, but ் in jquery.ime. This tutor follows thamizha ext.",
    "Consonant + a = bare consonant (no-op) here, matching jquery.ime and Tamil orthography. thamizha ext's fall-through rule would emit a separate அ.",
    "Shift+G/H/J/N are void in thamizha ext; jquery.ime puts decorative glyphs (⚫ ★) and ௱ ௐ on two of them.",
  ],
};

/* --- InScript: xkb-data symbols/in variant "tam", cross-checked vs jquery.ime --- */
const INSCRIPT: Layout = {
  id: "inscript",
  name: "InScript",
  tamilName: "இன்ஸ்கிரிப்ட்",
  blurb: "The IS 13194 government standard. Same key positions for every Indic script.",
  engine: "stateless",
  keys: {
    Backquote: ["ொ", "ஒ"],
    Digit1: ["௧", ""], Digit2: ["௨", ""], Digit3: ["௩", ""], Digit4: ["௪", ""],
    Digit5: ["௫", ""], Digit6: ["௬", ""], Digit7: ["௭", ""], Digit8: ["௮", ""],
    Digit9: ["௯", "("], Digit0: ["௦", ")"],
    Minus: ["௱", "ஃ"], Equal: ["௲", "+"],
    KeyQ: ["ௌ", "ஔ"], KeyW: ["ை", "ஐ"], KeyE: ["ா", "ஆ"], KeyR: ["ீ", "ஈ"], KeyT: ["ூ", "ஊ"],
    KeyU: ["ஹ", "ங"], KeyP: ["ஜ", ""], BracketRight: ["ஞ", ""],
    KeyA: ["ோ", "ஓ"], KeyS: ["ே", "ஏ"], KeyD: ["்", "அ"], KeyF: ["ி", "இ"], KeyG: ["ு", "உ"],
    KeyH: ["ப", ""], KeyJ: ["ர", "ற"], KeyK: ["க", ""], KeyL: ["த", ""],
    Semicolon: ["ச", ""], Quote: ["ட", ""],
    KeyZ: ["ெ", "எ"], KeyX: ["ஂ", ""], KeyC: ["ம", "ண"], KeyV: ["ந", "ன"],
    KeyB: ["வ", "ழ"], KeyN: ["ல", "ள"], KeyM: ["ஸ", "ஶ"],
    Comma: [",", "ஷ"], Period: [".", "।"], Slash: ["ய", "?"], Backslash: ["\\", "|"],
  },
  source: "xkb-data 2.35.1 symbols/in → variant \"tam\"; digits cross-checked vs jquery.ime ta-inscript",
  sourceUrl: "https://gitlab.freedesktop.org/xkeyboard-config/xkeyboard-config/-/blob/master/symbols/in",
  license: "xkb-data: MIT/X11-style (freedesktop) · jquery.ime rules: GPL-2.0-or-later OR MIT",
  divergences: [
    "Digit 0: xkb maps it to ௰ (TEN, U+0BF0); IS 13194 and jquery.ime map it to ௦ (ZERO, U+0BE6). This tutor uses ௦.",
    "xkb leaves y / i / o / [ unmapped, matching InScript convention for Tamil — those keys carry no Tamil glyph.",
    "& → க்ஷ taken from jquery.ime (xkb omits it). ZWJ/(') ZWNJ taken from jquery.ime.",
  ],
};

/* --- Tamil Typewriter: xkb-data symbols/in variant "tam_tamilnet" (TamilNet'99) --- */
const TYPEWRITER: Layout = {
  id: "typewriter",
  name: "Typewriter",
  tamilName: "தட்டெழுதி",
  blurb: "The TamilNet'99 typewriter map. What 40 years of Tamil typists' hands already know.",
  engine: "stateless",
  keys: {
    Digit4: ["4", "௹"],
    KeyQ: ["ஞ", "ஶ"], KeyW: ["ற", "ஷ"], KeyE: ["ந", "ஸ"], KeyR: ["ச", "ஹ"], KeyT: ["வ", "ஜ"],
    KeyY: ["ல", ""], KeyU: ["ர", ""],
    KeyI: ["ை", "ஐ"], KeyO: ["ொ", "ோ"], KeyP: ["ி", "ீ"], BracketLeft: ["ு", "ூ"],
    KeyA: ["ய", ""], KeyS: ["ள", ""], KeyD: ["ன", ""], KeyF: ["க", ""], KeyG: ["ப", ""],
    KeyH: ["ா", "ழ"], KeyJ: ["த", ""], KeyK: ["ம", ""], KeyL: ["ட", ""],
    Semicolon: ["்", "ஃ"], Quote: ["ங", ""],
    KeyZ: ["ண", ""], KeyX: ["ஒ", "ஓ"], KeyC: ["உ", "ஊ"], KeyV: ["எ", "ஏ"],
    KeyB: ["ெ", "ே"], KeyN: ["ஔ", "ௌ"], KeyM: ["அ", "ஆ"], Comma: ["இ", "ஈ"],
    Backquote: ["'", "~"],
  },
  source: "xkb-data 2.35.1 symbols/in → variant \"tam_tamilnet\" (TamilNet '99)",
  sourceUrl: "https://gitlab.freedesktop.org/xkeyboard-config/xkeyboard-config/-/blob/master/symbols/in",
  license: "xkb-data: MIT/X11-style (freedesktop)",
  divergences: [
    "TamilNet'99 carries no Tamil digits — the number row stays ASCII. InScript is the layout for ௧ ௨ ௩.",
    "The comma key is இ, not a comma. Passages here avoid commas rather than fake one.",
    "TamilNet'99 places vowel signs on their own keys in logical order (consonant first). The later 'New Typewriter' keyboards add visual-order dead keys; that reordering is not in this build.",
  ],
};

/* --- Phonetic: wikimedia/jquery.ime ta-transliteration v1.0, ported rule-for-rule --- */
const TRANSLIT: Layout = {
  id: "translit",
  name: "Phonetic",
  tamilName: "ஒலிபெயர்ப்பு",
  blurb: "Type Tamil the way it sounds: 'thamiz' → தமிழ். Rules rewrite what you just typed.",
  engine: "translit",
  keys: {},
  source: "wikimedia/jquery.ime rules/ta/ta-transliteration.js v1.0 (ported rule-for-rule)",
  sourceUrl: "https://github.com/wikimedia/jquery.ime/blob/master/rules/ta/ta-transliteration.js",
  license: "GPL-3.0-or-later © Junaid P V",
  divergences: [
    "Keys are sounds, not positions — the on-screen keyboard shows letters, not Tamil glyphs.",
    "A rule can REWRITE the buffer (க் + a → க), so 'output only grows' does not hold. The progress checker models this instead of assuming it away.",
  ],
};

export const LAYOUTS: Layout[] = [TAMIL99, INSCRIPT, TYPEWRITER, TRANSLIT];
export const layoutById = (id: LayoutId) => LAYOUTS.find((l) => l.id === id)!;

/* ---------- Physical keys ---------- */

/** Fallback for keys a layout leaves unmapped. */
export const ASCII: Record<string, [string, string]> = {
  Space: [" ", " "],
  Digit1: ["1", "!"], Digit2: ["2", "@"], Digit3: ["3", "#"], Digit4: ["4", "$"],
  Digit5: ["5", "%"], Digit6: ["6", "^"], Digit7: ["7", "&"], Digit8: ["8", "*"],
  Digit9: ["9", "("], Digit0: ["0", ")"],
  Minus: ["-", "_"], Equal: ["=", "+"],
  Backquote: ["`", "~"],
  KeyQ: ["q", "Q"], KeyW: ["w", "W"], KeyE: ["e", "E"], KeyR: ["r", "R"], KeyT: ["t", "T"],
  KeyY: ["y", "Y"], KeyU: ["u", "U"], KeyI: ["i", "I"], KeyO: ["o", "O"], KeyP: ["p", "P"],
  BracketLeft: ["[", "{"], BracketRight: ["]", "}"], Backslash: ["\\", "|"],
  KeyA: ["a", "A"], KeyS: ["s", "S"], KeyD: ["d", "D"], KeyF: ["f", "F"], KeyG: ["g", "G"],
  KeyH: ["h", "H"], KeyJ: ["j", "J"], KeyK: ["k", "K"], KeyL: ["l", "L"],
  Semicolon: [";", ":"], Quote: ["'", "\""],
  KeyZ: ["z", "Z"], KeyX: ["x", "X"], KeyC: ["c", "C"], KeyV: ["v", "V"], KeyB: ["b", "B"],
  KeyN: ["n", "N"], KeyM: ["m", "M"], Comma: [",", "<"], Period: [".", ">"], Slash: ["/", "?"],
};

export const KEY_ROWS: string[][] = [
  ["Backquote", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"],
  ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight", "Backslash"],
  ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote"],
  ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"],
];

export const KEY_CAP: Record<string, string> = {
  Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
  Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Space: "space",
};

export const FINGER: Record<string, number> = {
  Backquote: 1, Digit1: 1, KeyQ: 1, KeyA: 1, KeyZ: 1,
  Digit2: 2, KeyW: 2, KeyS: 2, KeyX: 2,
  Digit3: 3, KeyE: 3, KeyD: 3, KeyC: 3,
  Digit4: 4, Digit5: 4, KeyR: 4, KeyT: 4, KeyF: 4, KeyG: 4, KeyV: 4, KeyB: 4,
  Digit6: 7, Digit7: 7, KeyY: 7, KeyU: 7, KeyH: 7, KeyJ: 7, KeyN: 7, KeyM: 7,
  Digit8: 8, KeyI: 8, KeyK: 8, Comma: 8,
  Digit9: 9, KeyO: 9, KeyL: 9, Period: 9,
  Digit0: 10, Minus: 10, Equal: 10, KeyP: 10, Semicolon: 10, Quote: 10, Slash: 10,
  BracketLeft: 10, BracketRight: 10, Backslash: 10, Space: 6,
};

export const FINGER_LABEL: Record<number, string> = {
  1: "left pinky", 2: "left ring", 3: "left middle", 4: "left index",
  6: "thumb", 7: "right index", 8: "right middle", 9: "right ring", 10: "right pinky",
};

export const FINGER_COLOR: Record<number, string> = {
  1: "#e2705f", 2: "#e0a24a", 3: "#d8c95e", 4: "#8bbf6a",
  6: "#8f8f96", 7: "#6fae9c", 8: "#5fa0c4", 9: "#8b86cf", 10: "#c472a8",
};

/* ---------- Tamil99 rule set ---------- */

const SOFT_PAIRS: [string, string][] = [
  ["ங", "க"], ["ந", "த"], ["ம", "ப"], ["ஞ", "ச"], ["ண", "ட"], ["ன", "ற"],
];

const T99_SIGN: Record<string, string> = {
  KeyQ: "ா", KeyS: "ி", KeyW: "ீ", KeyD: "ு", KeyE: "ூ",
  KeyG: "ெ", KeyT: "ே", KeyR: "ை", KeyC: "ொ", KeyX: "ோ", KeyZ: "ௌ",
};

const T99_DEAD: Record<string, string> = {
  KeyQ: "ா", KeyS: "ி", KeyW: "ீ", KeyD: "ு", KeyE: "ூ",
  KeyG: "ெ", KeyT: "ே", KeyR: "ை", KeyC: "ொ", KeyX: "ோ", KeyZ: "ௌ",
  Period: "•", Digit7: "\u2018", Digit8: "\u2019",
  Digit9: "\u201C", Digit0: "\u201D",
};

/* ---------- The engine ---------- */

export type PressResult = {
  out: string;
  /** Transliteration rewrites: how many trailing chars of the buffer this rule consumed. */
  replace?: number;
  rule: string;
  note: string;
  tone: "neutral" | "auto" | "taught";
  dead: boolean;
};

/* --- Transliteration: faithful port of wikimedia/jquery.ime rules/ta/ta-transliteration.js
   (GPLv3+ © Junaid P V). Patterns match a SUFFIX of (buffer + key) and rewrite it.
   The list is order-sensitive: first match wins. -------------------------------- */

const TRANSLIT_RULES_SRC: [string, string][] = [
  ["ச்h", "ச்ஹ்"],
  ["ழ்h", "ழ்ஹ்"],
  ["ஸ்ர்i", "ஸ்ரீ"],
  ["க்(ச்|ஸ்)h", "க்\\u200Cஷ்"],
  ["க்(ச்|ஸ்)H", "க்ஷ்"],
  ["([க-ஹ])்a", "$1"],
  ["([க-ஹ])(்A|a)", "$1ா"],
  ["([க-ஹ])்i", "$1ி"],
  ["([க-ஹ])(்I|ிi)", "$1ீ"],
  ["([க-ஹ])்u", "$1ு"],
  ["([க-ஹ])(்U|ுu)", "$1ூ"],
  ["([க-ஹ])்e", "$1ெ"],
  ["([க-ஹ])(்E|ெe)", "$1ே"],
  ["([க-ஹ])i", "$1ை"],
  ["([க-ஹ])்o", "$1ொ"],
  ["([க-ஹ])(்O|ொo)", "$1ோ"],
  ["([க-ஹ])u", "$1ௌ"],
  ["([அ-ஹ][ெ-்]?)n", "$1ன்"],
  ["அa", "ஆ"],
  ["இi", "ஈ"],
  ["உu", "ஊ"],
  ["எe", "ஏ"],
  ["அi", "ஐ"],
  ["ஒo", "ஓ"],
  ["அu", "ஔ"],
  ["(ந்|ன்)g", "ங்"],
  ["(ந்|ன்)j", "ஞ்"],
  ["ச்h", "ஷ்"],
  ["ழ்h", "ழ்"],
  ["ட்h", "த்"],
  ["ஸ்h", "ஷ்"],
  ["a", "அ"], ["b", "ப்"], ["c", "ச்"], ["d", "ட்"], ["e", "எ"], ["f", "ஃப்"],
  ["g", "க்"], ["h", "ஹ்"], ["i", "இ"], ["j", "ஜ்"], ["k", "க்"], ["l", "ல்"],
  ["m", "ம்"], ["n", "ன்"], ["o", "ஒ"], ["p", "ப்"], ["q", "ஃ"], ["r", "ர்"],
  ["s", "ச்"], ["t", "ட்"], ["u", "உ"], ["v", "வ்"], ["w", "ந்"], ["y", "ய்"],
  ["z", "ழ்"],
  ["A", "ஆ"], ["B", "ப்"], ["C", "க்க்"], ["E", "ஏ"], ["F", "ஃப்"], ["G", "க்"],
  ["H", "ஃ"], ["I", "ஈ"], ["J", "ஜ்ஜ்"], ["K", "க்"], ["L", "ள்"], ["M", "ம்ம்"],
  ["N", "ண்"], ["O", "ஓ"], ["P", "ப்ப்"], ["Q", "ஃ"], ["R", "ற்"], ["S", "ஸ்"],
  ["T", "ட்"], ["U", "ஊ"], ["(V|W)", "வ்வ்"], ["Y", "ய்ய்"], ["Z", "ஶ்"],
  ["\\\\0", "௦"], ["\\\\1", "௧"], ["\\\\2", "௨"], ["\\\\3", "௩"], ["\\\\4", "௪"],
  ["\\\\5", "௫"], ["\\\\6", "௬"], ["\\\\7", "௭"], ["\\\\8", "௮"], ["\\\\9", "௯"],
  ["10\\\\", "௰"], ["100\\\\", "௱"], ["1000\\\\", "௲"],
];

const TRANSLIT_RULES: [RegExp, string][] = TRANSLIT_RULES_SRC.map(
  ([pat, rep]) => [new RegExp(pat + "$", "gu"), rep],
);

/** Is produced text still consistent with the target? Allows transliteration's
 * intermediate state: a trailing consonant+pulli that a vowel key will rewrite. */
export function onTrack(s: string, target: string): boolean {
  if (target.startsWith(s)) return true;
  if (s.endsWith(PULLI) && target.startsWith(s.slice(0, -1))) return true;
  return false;
}

/** How much of the target the produced text accounts for. */
export function progressLen(s: string, target: string): number {
  if (target.startsWith(s)) return s.length;
  if (s.endsWith(PULLI) && target.startsWith(s.slice(0, -1))) return s.length - 1;
  return 0;
}

/** Commit a press result to a buffer, honouring transliteration rewrites. */
function applyPress(buf: string, r: PressResult): string {
  const rep = r.replace ?? 0;
  return rep ? buf.slice(0, buf.length - rep) + r.out : buf + r.out;
}

/** Can any single follow-up key bring this buffer back on track?
 *  This is what makes 'th' legal for த even though 't' alone emits ட், which
 *  is a prefix of nothing. The intermediate state is provisional — exactly how
 *  a live transliteration IME rewrites under your fingers. */
export function reachable(lay: Layout, buf: string, target: string, dead: boolean): boolean {
  for (const k of allKeys()) {
    const r = press(lay, buf, k.code, k.shift, dead);
    if (r.dead) continue;
    if (onTrack(nfc(applyPress(buf, r)), target)) return true;
  }
  return false;
}

/** Exhaustive search: can this layout produce the text at all? Used for
 *  transliteration, where greedy walks can wander into dead digraph ends. */
export function typeableSearch(lay: Layout, text: string): boolean {
  const t = nfc(text);
  const seen = new Set<string>([""]);
  let frontier = [""];
  let guard = 0;
  while (frontier.length && guard++ < 600) {
    const next: string[] = [];
    for (const buf of frontier) {
      for (const k of allKeys()) {
        const r = press(lay, buf, k.code, k.shift, false);
        if (r.dead) continue;
        const nb = nfc(applyPress(buf, r));
        if (nb === t) return true;
        if (!onTrack(nb, t)) continue;
        if (seen.has(nb)) continue;
        seen.add(nb);
        next.push(nb);
      }
    }
    frontier = next;
  }
  return false;
}

/** Lexicographic progress score: matched length first, then clean beats partial.
 * வ் (partial) and வ (clean) both match 1 akshara of வணக்கம், but resolving
 * the pulli is real forward motion and must rank as a hint. */
function progScore(s: string, target: string): [number, number] {
  if (target.startsWith(s)) return [s.length, 1];
  if (s.endsWith(PULLI) && target.startsWith(s.slice(0, -1))) return [s.length - 1, 0];
  return [0, 0];
}
const progGT = (a: [number, number], b: [number, number]) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);

/** Apply one transliteration rule set step. Returns null if no rule matches. */
export function translitStep(tail: string, key: string): { out: string; replace: number } | null {
  const hay = tail + key;
  for (const [re, repSrc] of TRANSLIT_RULES) {
    re.lastIndex = 0;
    const m = re.exec(hay);
    if (!m || m.index + m[0].length !== hay.length) continue;
    const rep = repSrc.replace(/\$(\d)/g, (_, d) => m[Number(d)] ?? "");
    return { out: rep, replace: m[0].length - 1 };
  }
  return null;
}

const lastAkshara = (buf: string) => {
  const a = aksharas(buf);
  return a.length ? a[a.length - 1] : "";
};

/** Apply one physical keystroke to the committed buffer. */
export function press(lay: Layout, buf: string, code: string, shift: boolean, dead: boolean): PressResult {
  const plain = (s: string, note = ""): PressResult => ({ out: s, rule: "direct", note, tone: "neutral", dead: false });
  const fallback = ASCII[code]?.[shift ? 1 : 0] ?? "";

  if (lay.engine === "stateless") {
    const m = lay.keys[code];
    const ch = m ? (shift ? m[1] ?? "" : m[0]) : fallback;
    let note = "";
    if (m && !shift) note = `${lay.name}: ${KEY_CAP[code] ?? code.toUpperCase()} → ${m[0]}`;
    if (m && shift) note = `${lay.name}: Shift+${KEY_CAP[code] ?? code.toUpperCase()} → ${m[1]}`;
    return plain(ch, note);
  }

  /* ---- Transliteration: ordered suffix rules rewrite the tail of the buffer ---- */
  if (lay.engine === "translit") {
    if (!fallback) return { out: "", rule: "void", note: "", tone: "neutral", dead: false };
    const step = translitStep(buf.slice(-16), fallback);
    if (step) {
      return {
        out: step.out,
        replace: step.replace,
        rule: "translit",
        note: `${lay.name}: …${(buf.slice(-16) + fallback).slice(-(step.replace + fallback.length))} → ${step.out}`,
        tone: "taught",
        dead: false,
      };
    }
    return { out: fallback, rule: "translit-literal", note: `${lay.name}: ${fallback} (no rule — passthrough)`, tone: "neutral", dead: false };
  }

  /* ---- Tamil99 ---- */
  if (dead) {
    if (code === "Backquote") return { out: "^", rule: "dead-escape", note: "Caret again gives a literal ^.", tone: "taught", dead: false };
    if (code === "Period") return { out: "•", rule: "dead-bullet", note: "Caret + . → bullet •  (Tamil99 Extended, rule 10).", tone: "taught", dead: false };
    if (["Digit7", "Digit8", "Digit9", "Digit0"].includes(code)) {
      const q = { Digit7: "\u2018", Digit8: "\u2019", Digit9: "\u201C", Digit0: "\u201D" }[code]!;
      return { out: q, rule: "dead-quote", note: `Caret + ${KEY_CAP[code]} → ${q}  (rule 11).`, tone: "taught", dead: false };
    }
    if (code === "KeyS" && shift) return { out: "\u00A0", rule: "dead-nbsp", note: "Caret + Shift+S → non-breaking space.", tone: "taught", dead: false };
    if (code === "KeyC" && shift) return { out: "©", rule: "dead-copy", note: "Caret + Shift+C → ©.", tone: "taught", dead: false };
    if (code === "KeyC") return { out: "ொ", rule: "dead-sign", note: "Caret reveals ொ — the okara vowel sign (rule 9).", tone: "taught", dead: false };
    if (code === "KeyX") return { out: "ோ", rule: "dead-sign", note: "Caret reveals ோ — the Okaara vowel sign.", tone: "taught", dead: false };
    if (code === "KeyZ") return { out: "ௌ", rule: "dead-sign", note: "Caret reveals ௌ — the Aukaara vowel sign.", tone: "taught", dead: false };
    if (T99_DEAD[code] && !shift) return { out: T99_DEAD[code], rule: "dead-sign", note: `Caret reveals ${T99_DEAD[code]} — a vowel modifier you can see instead of guess (rule 9).`, tone: "taught", dead: false };
    return { out: "", rule: "dead-cancel", note: "Caret cancelled — that key has no caret form.", tone: "neutral", dead: false };
  }

  if (code === "Backquote" && !shift) {
    return { out: "", rule: "dead-arm", note: "Caret armed. Tamil99's dead key reveals vowel modifiers (^ then q s w d e …).", tone: "taught", dead: true };
  }

  // Grantha + space → pulli form (Extended)
  if (code === "Space" && GRANTHA.includes(lastChar(buf))) {
    return { out: PULLI + " ", rule: "grantha-space", note: `Tamil99 Extended: a grantha letter before a space takes a pulli (${buf.slice(-1)} → ${buf.slice(-1)}்).`, tone: "auto", dead: false };
  }

  // Shifted forms
  if (shift) {
    const sym: Record<string, string> = {
      KeyA: "௹", KeyS: "௺", KeyD: "௸", KeyZ: "௳", KeyX: "௴", KeyC: "௵", KeyV: "௶", KeyB: "௷",
      KeyF: "ஃ", KeyT: "ஸ்ரீ", KeyY: "க்ஷ", KeyI: "ஶ்ரீ",
      KeyO: "[", KeyP: "]", Semicolon: ";", Quote: "'", KeyK: "\"", KeyL: ":", KeyM: "/",
    };
    if (sym[code] !== undefined) {
      return { out: sym[code], rule: "shift-symbol", note: `Tamil99 Shift+${KEY_CAP[code] ?? code.toUpperCase()} → ${sym[code]}`, tone: "neutral", dead: false };
    }
    const m = lay.keys[code];
    if (m) return { out: m[1] ?? "", rule: "shift-grantha", note: `Tamil99 Shift+${KEY_CAP[code] ?? code.toUpperCase()} → ${m[1]} (grantha)`, tone: "neutral", dead: false };
    return { out: fallback, rule: "literal", note: "", tone: "neutral", dead: false };
  }

  const mapped = lay.keys[code];

  // Pulli
  if (code === "KeyF") {
    const last = buf.slice(-1);
    if (isConsonant(last)) {
      return { out: PULLI, rule: "pulli", note: "Pulli ் added — the consonant loses its inherent vowel.", tone: "taught", dead: false };
    }
    return { out: "ஃ", rule: "aytham", note: "With no consonant before it, Tamil99's f key gives āytam ஃ.", tone: "taught", dead: false };
  }

  // Vowel signs
  if (T99_SIGN[code]) {
    const last = buf.slice(-1);
    if (isConsonant(last)) {
      return { out: T99_SIGN[code], rule: "vowel-sign", note: `${last} + ${T99_SIGN[code]} → the vowel sign attaches (Tamil99 rule 3).`, tone: "taught", dead: false };
    }
    const indep = INDEPENDENT[T99_SIGN_INDEX[code]];
    return { out: indep, rule: "independent-vowel", note: `No consonant before it, so this is the independent vowel ${indep}.`, tone: "taught", dead: false };
  }

  if (code === "KeyA") {
    const last = buf.slice(-1);
    if (isConsonant(last)) {
      return { out: "", rule: "inherent-a", note: `${last} already carries the inherent அ. Nothing is added — Pressing a here is a no-op.`, tone: "taught", dead: false };
    }
    return { out: "அ", rule: "independent-vowel", note: "Independent vowel அ.", tone: "neutral", dead: false };
  }

  if (mapped) {
    const ch = mapped[0];
    if (!ch) return { out: fallback, rule: "literal", note: "", tone: "neutral", dead: false };
    const la = lastAkshara(buf);
    if (la === ch) {
      return { out: PULLI + ch, rule: "auto-pulli", note: `Auto-pulli: the same consonant twice gives a geminate — ${ch} → ${ch}்${ch}. To keep them separate you need a pulli or a vowel.`, tone: "auto", dead: false };
    }
    if (la === ch + PULLI + ch) {
      return { out: ch, rule: "auto-pulli-cont", note: `Geminate continues: ${la} + ${ch} → ${la}${ch}.`, tone: "auto", dead: false };
    }
    const pair = SOFT_PAIRS.find(([a, b]) => la === a && ch === b);
    if (pair) {
      return { out: PULLI + ch, rule: "soft-pair", note: `Soft→hard pair: ${pair[0]} + ${pair[1]} → ${pair[0]}்${pair[1]}. Classical Tamil pairs a nasal with its homorganic stop automatically.`, tone: "auto", dead: false };
    }
    return { out: ch, rule: "consonant", note: `${KEY_CAP[code] ?? code.toUpperCase()} → ${ch}`, tone: "neutral", dead: false };
  }

  if (fallback) return plain(fallback);
  return { out: "", rule: "void", note: "", tone: "neutral", dead: false };
}

const T99_SIGN_INDEX: Record<string, number> = {
  KeyQ: 1, KeyS: 2, KeyW: 3, KeyD: 4, KeyE: 5, KeyG: 6, KeyT: 7, KeyR: 8, KeyC: 9, KeyX: 10, KeyZ: 11,
};

/** Every physical key, for brute-force hint search. */
function allKeys(): { code: string; shift: boolean }[] {
  const out: { code: string; shift: boolean }[] = [];
  for (const row of KEY_ROWS) for (const code of row) {
    out.push({ code, shift: false }, { code, shift: true });
  }
  out.push({ code: "Space", shift: false });
  return out;
}

/** Which keys produce the next needed output, verified by simulation. */
export function nextKeys(lay: Layout, buf: string, target: string, dead: boolean): { code: string; shift: boolean }[] {
  const hits: { code: string; shift: boolean }[] = [];
  const prog0 = progScore(nfc(buf), target);
  const tier1: { code: string; shift: boolean }[] = [];
  const tier2: { code: string; shift: boolean }[] = [];
  for (const k of allKeys()) {
    const r = press(lay, buf, k.code, k.shift, dead);
    if (r.dead) continue;
    const nbn = nfc(applyPress(buf, r));
    if (!onTrack(nbn, target)) {
      if (reachable(lay, nbn, target, r.dead)) tier2.push(k);
      continue;
    }
    if (progGT(progScore(nbn, target), prog0)) tier1.push(k);
  }
  return tier1.length ? tier1 : tier2;
}

/** Can this layout type this text at all? */
export function typeable(lay: Layout, text: string): boolean {
  if (lay.engine === "translit") return typeableSearch(lay, text);
  const t = nfc(text);
  let buf = "";
  let dead = false;
  let guard = 0;
  while (nfc(buf) !== t && guard++ < 400) {
    const hits = nextKeys(lay, buf, t, dead);
    if (!hits.length) return false;
    const r = press(lay, buf, hits[0].code, hits[0].shift, dead);
    buf = applyPress(buf, r);
    dead = r.dead;
  }
  return nfc(buf) === t;
}

/* ---------- Lessons ---------- */

export type Lesson = {
  id: string;
  title: string;
  tamil: string;
  teaches: string;
  items: string[];
  layouts?: LayoutId[];
};

export type Chapter = {
  id: string;
  title: string;
  tamil: string;
  lessons: Lesson[];
};

/* The lesson book: six chapters, each lesson a set of small exercises.
   A learner finishes one exercise at a time; progress is tracked per exercise
   per layout, and the book is the table of contents they return to. */

export const BOOK: Chapter[] = [
  {
    id: "c1",
    title: "Foundations",
    tamil: "அடிப்படை",
    lessons: [
      {
        id: "L1", title: "First letters", tamil: "முதல் எழுத்துக்கள்",
        teaches: "Nine single aksharas — three vowels and six consonants. One keystroke each.",
        items: ["அ", "இ", "உ", "எ", "க", "ப", "ம", "த", "ந"],
      },
      {
        id: "L2", title: "Akshara pairs", tamil: "இணை எழுத்துக்கள்",
        teaches: "Two and three aksharas in one breath — your first real words.",
        items: ["கப", "மத", "நப", "கபமத", "அஇஉ"],
      },
    ],
  },
  {
    id: "c2",
    title: "The pulli",
    tamil: "புள்ளி",
    lessons: [
      {
        id: "L3", title: "Basic pulli", tamil: "அடிப்படைப் புள்ளி",
        teaches: "் strips the inherent vowel. It is the single most-used key in Tamil typing.",
        items: ["க்", "ப்", "ம்", "த்"],
      },
      {
        id: "L4", title: "Pulli pairs", tamil: "இணைப் புள்ளி",
        teaches: "Two pullis in one line — the rhythm a typist actually uses.",
        items: ["க் ப்", "ம் த்", "ந் க்"],
      },
    ],
  },
  {
    id: "c3",
    title: "Vowels and signs",
    tamil: "உயிர் எழுத்து",
    lessons: [
      {
        id: "L5", title: "Twelve vowels", tamil: "பன்னிரண்டு உயிர்கள்",
        teaches: "All twelve independent vowels, short and long.",
        items: ["அ ஆ இ ஈ", "உ ஊ எ ஏ", "ஐ ஒ ஓ ஔ"],
      },
      {
        id: "L6", title: "Vowel signs", tamil: "உயிர்க்குறியீடுகள்",
        teaches: "The sign keys hang off the consonant you just typed. This is where speed is won.",
        items: ["கா கி கீ", "கு கூ கெ", "கே கை கொ", "கோ கௌ"],
      },
      {
        id: "L7", title: "Uyirmei pairs", tamil: "உயிர்மெய் இணை",
        teaches: "Consonant + sign, at speed, without looking down.",
        items: ["கம", "கல", "தல", "பர", "மர", "கத", "வர", "நகர"],
      },
    ],
  },
  {
    id: "c4",
    title: "Words",
    tamil: "சொற்கள்",
    lessons: [
      {
        id: "L8", title: "Everyday words", tamil: "அன்றாடச் சொற்கள்",
        teaches: "Geminates, grantha and the auto-pulli, inside words that actually mean something.",
        items: ["தமிழ்", "வணக்கம்", "நன்றி", "அகரம்", "எழுத்து", "மொழி"],
      },
      {
        id: "L9", title: "Longer words", tamil: "நீண்ட சொற்கள்",
        teaches: "Multi-akshara words — கலப்பை is the project's own name.",
        items: ["கலப்பை", "பள்ளி"],
      },
      {
        id: "L10", title: "Grantha & conjuncts", tamil: "கிரந்தம்",
        teaches: "Sanskrit loans: ஸ ஷ ஜ ஹ ஶ, and the க்ஷ / ஸ்ரீ ligatures.",
        items: ["ஸ", "ஷ", "ஜ", "ஹ", "ஶ", "க்ஷ", "ஸ்ரீ"],
      },
      {
        id: "L11", title: "Tamil digits", tamil: "எண்கள்",
        teaches: "௧ ௨ ௩ … InScript carries Tamil numerals on the number row; the typewriter map does not.",
        items: ["௧ ௨ ௩", "௪ ௫ ௬", "௭ ௮ ௯", "௧௦"],
        layouts: ["inscript"],
      },
    ],
  },
  {
    id: "c5",
    title: "Sentences",
    tamil: "வாக்கியம்",
    lessons: [
      {
        id: "L12", title: "Short sentences", tamil: "சிறு வாக்கியம்",
        teaches: "Spaces, word boundaries, and keeping rhythm across a line.",
        items: ["தமிழ் எனது மொழி", "நன்றி வணக்கம்"],
      },
      {
        id: "L13", title: "Practice passage", tamil: "பயிற்சி பத்தி",
        teaches: "Full-width prose with punctuation. Graded on net speed, exactly as an examination would.",
        items: ["அன்புள்ள அம்மா நான் நலம். படிப்பு நன்றாக நடக்கிறது. விரைவில் வருகிறேன்.", "தமிழ் மொழி மிகவும் பழமையானது. அது இனிமையானது."],
      },
    ],
  },
];

export const LESSONS: Lesson[] = BOOK.flatMap((c) => c.lessons);

/* ---------- Progress (local-first, no accounts) ---------- */

const PROGRESS_KEY = "kalappai-progress-v1";

export type ProgressMap = Record<string, 1>; // key: `${layoutId}:${lessonId}:${exerciseIndex}`

export function loadProgress(): ProgressMap {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function saveProgress(p: ProgressMap) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* private mode — progress lives for the session only */
  }
}

export const progressKey = (layoutId: string, lessonId: string, idx: number) => `${layoutId}:${lessonId}:${idx}`;

export function doneCount(p: ProgressMap, layoutId: string, lessonId: string, total: number): number {
  let n = 0;
  for (let i = 0; i < total; i++) if (p[progressKey(layoutId, lessonId, i)]) n++;
  return n;
}

/* ---------- Metrics ---------- */

export type Metrics = {
  typed: number;
  errors: number;
  strokes: number;
  minutes: number;
  gross: number;
  net: number;
  accuracy: number;
  kdph: number;
};

export function metrics(typed: number, errors: number, strokes: number, ms: number): Metrics {
  const minutes = Math.max(ms / 60000, 1 / 60000);
  return {
    typed,
    errors,
    strokes,
    minutes,
    gross: typed / 5 / minutes,
    net: Math.max(typed - errors, 0) / 5 / minutes,
    accuracy: strokes ? Math.max(0, (strokes - errors) / strokes) * 100 : 100,
    kdph: (strokes / minutes) * 60,
  };
}

export function selfCheck(): { ok: boolean; lines: { layout: string; lesson: string; item: string; ok: boolean }[] } {
  const lines: { layout: string; lesson: string; item: string; ok: boolean }[] = [];
  for (const lay of LAYOUTS) {
    if (lay.engine === "translit") continue; /* translit coverage is proven by golden tests, not brute force at page load */
    for (const l of LESSONS) {
      if (l.layouts && !l.layouts.includes(lay.id)) continue;
      for (const item of l.items) lines.push({ layout: lay.name, lesson: l.id, item, ok: typeable(lay, item) });
    }
  }
  return { ok: lines.every((l) => l.ok), lines };
}

