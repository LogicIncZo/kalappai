import { describe, expect, test } from "bun:test";
import { selfCheck, press, LESSONS, LAYOUTS, aksharas } from "../src/engine";

function keyCode(ch: string): string {
  const up = ch.toUpperCase();
  if (up >= "A" && up <= "Z") return "Key" + up;
  const map: Record<string, string> = { ";": "Semicolon", "'": "Quote", "[": "BracketLeft", "]": "BracketRight", "/": "Slash", ".": "Period", ",": "Comma", " ": "Space", "-": "Minus", "=": "Equal", "`": "Backquote" };
  if (map[ch]) return map[ch];
  if (ch >= "0" && ch <= "9") return "Digit" + ch;
  return "";
}

type Res = ReturnType<typeof press>;

function run(lay: (typeof LAYOUTS)[number], keys: string, translit = false): string {
  let buf = "", dead = false;
  for (const ch of keys) {
    const shift = ch >= "A" && ch <= "Z";
    const code = keyCode(ch);
    const r: Res = press(lay, buf, code, shift, dead);
    if (r.rule === "void" && !r.out) return buf + "\u0000VOID";
    buf = translit && r.replace ? buf.slice(0, buf.length - r.replace) + r.out : buf + r.out;
    dead = r.dead;
  }
  return buf;
}

describe("engine self-check", () => {
  test("every lesson item is reachable on its declared layout", () => {
    const sc = selfCheck();
    const failures = sc.lines.filter((x) => !x.ok);
    expect(failures).toEqual([]);
    expect(sc.lines.length).toBe(169);
  });
});

describe("golden keystrokes — Tamil99", () => {
  const t99 = LAYOUTS.find((l) => l.id === "tamil99")!;
  const goldens: [string, string][] = [
    ["h", "க"], ["hh", "க்க"], ["hhh", "க்கக"], ["hf", "க்"],
    ["hq", "கா"], ["ha", "க"], ["hqi", "கான"],
    ["kf", "ம்"], ["jf", "ப்"],
    ["bf", "ங்"], ["bh", "ங்க"],
    [";l", "ந்த"], ["kj", "ம்ப"],
    ["Y", "க்ஷ"], ["T", "ஸ்ரீ"], ["I", "ஶ்ரீ"], ["F", "ஃ"],
    ["lks/f", "தமிழ்"],
    ["vphhkf", "வணக்கம்"],
    [";ifus", "நன்றி"],
    ["akmf", "அமர்"],
  ];
  for (const [keys, want] of goldens) {
    test(`"${keys}" → ${want}`, () => {
      expect(run(t99, keys)).toBe(want);
    });
  }
});

describe("golden keystrokes — phonetic transliteration (jquery.ime port)", () => {
  const lay = LAYOUTS.find((l) => l.id === "translit")!;
  const goldens: [string, string][] = [
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
  for (const [keys, want] of goldens) {
    test(`"${keys}" → ${want}`, () => {
      expect(run(lay, keys, true).normalize("NFC")).toBe(want);
    });
  }
});

describe("akshara tokenizer", () => {
  test("splits Tamil text into grapheme units", () => {
    expect(aksharas("தமிழ்")).toEqual(["த", "மி", "ழ்"]);
    expect(aksharas("வணக்கம்")).toEqual(["வ", "ண", "க்க", "ம்"]);
    expect(aksharas("கொ")).toEqual(["கொ"]);
    expect(aksharas("ஸ்ரீ")).toEqual(["ஸ்ரீ"]);
  });

  test("lesson book is non-empty and every lesson has items", () => {
    expect(LESSONS.length).toBeGreaterThanOrEqual(13);
    for (const l of LESSONS) expect(l.items.length).toBeGreaterThan(0);
    expect(LAYOUTS.map((l) => l.id)).toContain("translit");
  });
});
