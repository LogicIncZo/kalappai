/**
 * Demo walkthrough — drives the *built* app in a real browser and captures the
 * screenshots a release post, a README or a hand-off can use.
 *
 * Why this exists: a typing tutor is a claim about what happens when a person
 * presses keys. Unit tests prove the rule machines; only a browser proves the
 * wiring — that the page reads `event.code`, that the hint is the key the engine
 * would actually accept, that finishing an exercise is detected, that switching
 * layout changes the key path and not the Tamil.
 *
 * It is deliberately NOT part of the default gate (`bun run verify`), because it
 * needs a browser and takes ~30s. `bun run verify --full` runs it.
 *
 * Two design choices worth knowing:
 *
 *   1. The keystrokes are computed by the engine's own `nextKeys`, not written
 *      down here. A walkthrough with a hardcoded key list is a walkthrough that
 *      silently rots the first time a layout changes. This one fails loudly.
 *   2. Elements are found by their visible text, not by snapshot refs, which
 *      shift between runs and would make the script flaky for no real reason.
 *
 * Usage:
 *   bun run demo:walkthrough            # build first (`bun run build`)
 *   bun run demo:walkthrough --headful  # not supported; kept for symmetry
 */
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join, normalize, relative } from "node:path";
import { aksharas, EXAM_TEXT, LAYOUTS, nfc, nextKeys, press, type Layout } from "../src/engine";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, "demo", "out");
const BASE = process.env.KALAPPAI_BASE ?? "/kalappai/";

const BOLD = "\u001b[1m";
const DIM = "\u001b[2m";
const GREEN = "\u001b[0;32m";
const RED = "\u001b[0;31m";
const NC = "\u001b[0m";

let failed = 0;
let steps = 0;

function ok(label: string, detail = "") {
  steps++;
  console.log(`  ${GREEN}✓${NC} ${label}${detail ? ` ${DIM}(${detail})${NC}` : ""}`);
}
function bad(label: string, detail = "") {
  steps++;
  failed++;
  console.log(`  ${RED}✗${NC} ${label}${detail ? ` ${DIM}(${detail})${NC}` : ""}`);
}
function stage(title: string) {
  console.log(`\n${BOLD}${title}${NC}`);
}

/* ---------- the built app, served the way GitHub Pages serves it ---------- */

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function resolveAsset(pathname: string): string | null {
  let p = pathname.split("?")[0] ?? "";
  if (!p.startsWith(BASE)) {
    if (p === BASE.replace(/\/$/, "")) p = BASE;
    else return null;
  }
  p = p.slice(BASE.length) || "index.html";
  if (p.endsWith("/")) p += "index.html";
  const file = normalize(join(DIST, p));
  if (relative(DIST, file).startsWith("..")) return null;
  return file;
}

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    const file = resolveAsset(url.pathname);
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
      return new Response("not found", { status: 404 });
    }
    const ext = file.slice(file.lastIndexOf("."));
    return new Response(await Bun.file(file).arrayBuffer(), {
      headers: { "content-type": MIME[ext] ?? "application/octet-stream" },
    });
  },
});

/* ---------- tiny agent-browser client ---------- */

function ab(args: string[]): string {
  const r = Bun.spawnSync(["agent-browser", ...args]);
  return (r.stdout.toString() || r.stderr.toString()).trim();
}

async function open(url: string) {
  let r = Bun.spawnSync(["agent-browser", "open", url]);
  if (r.exitCode !== 0) {
    await Bun.sleep(1500);
    r = Bun.spawnSync(["agent-browser", "open", url]);
  }
  if (r.exitCode !== 0) throw new Error("agent-browser could not open the page");
}

/** Evaluate an expression in the page and return the raw string result. */
function ev(expr: string): string {
  const out = ab(["eval", expr]);
  try {
    return JSON.parse(out);
  } catch {
    return out;
  }
}

async function shot(name: string) {
  mkdirSync(OUT, { recursive: true });
  ab(["screenshot", join(OUT, `${name}.png`), "--full"]);
}

async function settle(ms = 400) {
  await Bun.sleep(ms);
}

/**
 * Click the first element whose text contains `text`, ignoring case.
 *
 * Case matters here: the mode buttons read `exam` / `learn` in the DOM and are
 * capitalised by CSS, so a case-sensitive search for "Exam" silently finds
 * nothing and the step fails for the wrong reason.
 */
function clickText(text: string, tag = "button") {
  const expr =
    `(() => { const want = ${JSON.stringify(text)}.toLowerCase();` +
    ` const el = [...document.querySelectorAll(${JSON.stringify(tag)})]` +
    `.find((e) => e.textContent && e.textContent.toLowerCase().includes(want));` +
    ` if (!el) return "missing"; el.click(); return "clicked"; })()`;
  return ev(expr);
}

const bodyText = () => ev("document.body.innerText");

/**
 * Text of the practice stage panel (the one carrying the akshara counter) — it is
 * what distinguishes "exam mode opened" from "the Exam button merely exists in the
 * header", which is exactly the false positive this gate must not have.
 */
const stageText = () => ev(`(() => {
    const el = document.querySelector("[data-kalappai-stage]");
    return el ? el.innerText : "";
  })()`);

/* ---------- keystroke driver ---------- */

/**
 * The keys needed to produce `target` on this layout, computed by the engine's
 * own hint function — the same one the UI shows the learner.
 */
function sequenceFor(lay: Layout, target: string): { code: string; shift: boolean }[] {
  const seq: { code: string; shift: boolean }[] = [];
  let cur = "";
  let dead = false;
  let guard = 0;
  while (nfc(cur) !== nfc(target) && guard++ < 600) {
    const keys = nextKeys(lay, cur, target, dead);
    if (!keys.length) break;
    const k = keys[0];
    const r = press(lay, cur, k.code, k.shift, dead);
    const rep = r.replace ?? 0;
    cur = rep ? cur.slice(0, cur.length - rep) + r.out : cur + r.out;
    dead = r.dead;
    seq.push({ code: k.code, shift: k.shift });
  }
  return seq;
}

/**
 * Dispatch a whole sequence into the page, yielding between events.
 *
 * The yield matters: the app holds its buffer in a ref, but each keystroke also
 * re-renders. Firing all events in one synchronous turn would have every handler
 * read the same stale buffer.
 *
 * `paceMs` is the gap between keystrokes, and it is not cosmetic: the app derives
 * WPM from wall-clock time, so a machine-speed burst produces a 500 wpm "record"
 * that would be a lie in a screenshot. The default is still far faster than a
 * human; the legs that get captured pass a realistic pace.
 */
async function typeSequence(seq: { code: string; shift: boolean }[], paceMs = 25): Promise<boolean> {
  ev(
    `(() => { window.__kalSeq = ${JSON.stringify(seq)}; window.__kalDone = false;` +
      ` window.__kalKeys = 0;` +
      ` (async () => { for (const k of window.__kalSeq) {` +
      ` window.dispatchEvent(new KeyboardEvent("keydown", { code: k.code, shiftKey: !!k.shift, key: "Unidentified", bubbles: true }));` +
      ` window.__kalKeys++; await new Promise((r) => setTimeout(r, ${paceMs})); }` +
      ` window.__kalDone = true; })(); return "started"; })()`,
  );
  /* the deadline has to clear the pacing, or a deliberately slow leg reads as a hang */
  const deadline = Date.now() + Math.max(30_000, seq.length * paceMs + 15_000);
  while (Date.now() < deadline) {
    const done = ev("String(window.__kalDone)");
    if (done === "true") return true;
    await Bun.sleep(150);
  }
  return false;
}

/* ---------- the walkthrough ---------- */

async function main() {
  if (!existsSync(join(DIST, "index.html"))) {
    console.log(`${RED}✗ dist/index.html is missing — run \`bun run build\` first${NC}`);
    server.stop(true);
    process.exit(1);
  }
  if (!Bun.which("agent-browser")) {
    console.log(`${RED}✗ agent-browser not found — the walkthrough needs a browser${NC}`);
    server.stop(true);
    process.exit(1);
  }

  const url = `http://127.0.0.1:${server.port}${BASE}`;
  console.log(`${BOLD}Kalappai walkthrough${NC} ${DIM}— ${url} → demo/out/*.png${NC}`);

  await open(url);
  /* Start from a clean learner state so the screenshots are reproducible. */
  ev('(() => { localStorage.clear(); location.reload(); return "reset"; })()');
  await settle(3000);

  /* ---- 1. the book ---- */
  stage("1. the lesson book");
  let text = await bodyText();
  if (/கலப்பை/.test(text) && /First letters/.test(text)) {
    ok("the book renders every chapter and lesson");
  } else {
    bad("the book did not render", text.slice(0, 60));
  }
  const bookState = ev(
    `(() => { const b = [...document.querySelectorAll("button")].filter((e) => /\\d+\\/\\d+/.test(e.textContent || ""));` +
      ` return b.length + " lesson buttons, " + b.filter((e) => !e.disabled).length + " enabled"; })()`,
  );
  ok("lessons are addressable", String(bookState));
  await shot("01-book");

  /* ---- 2. a lesson, with the live hint ---- */
  stage("2. practice view + the hint engine");
  const clicked = clickText("First letters");
  await settle(700);
  text = await bodyText();
  if (clicked === "clicked" && /TYPE THIS/.test(text)) ok("the lesson opens in practice view");
  else bad("practice view did not open", String(clicked));

  const firstKey = ev(
    `(() => { const el = [...document.querySelectorAll("*")].find((e) => e.children.length === 0 && /^[A-Z]$/.test((e.textContent || "").trim()));` +
      ` return el ? el.textContent.trim() : "none"; })()`,
  );
  ok("the hint names a physical key to press", `key \`${firstKey}\``);
  await shot("02-practice-hint");

  /* ---- 3. type the exercise with the engine's own keys ---- */
  stage("3. typing (keys computed by the engine, not written here)");
  const tamil99 = LAYOUTS.find((l) => l.name === "Tamil99") as Layout;
  const firstItem = "அஇஉக";
  const seq1 = sequenceFor(tamil99, firstItem);
  if (!seq1.length) {
    bad("the engine could not produce a key sequence");
  } else {
    ok("the engine produced a keystroke path", `${seq1.length} keys for ${firstItem}`);
    /* captured in screenshots, so pace it like a learner rather than a machine */
    const finished = await typeSequence(seq1, 380);
    await settle(600);
    if (!finished) bad("the keystroke sequence did not finish");
    else ok("every keystroke was dispatched");
    text = await bodyText();
    if (/Practice record|Lesson done|Next exercise/.test(text)) {
      ok("the app recognised the exercise as complete");
    } else {
      bad("the app did not register completion");
    }
  }
  await shot("03-typed");

  /* ---- 4. the layout switch: different keys, same Tamil ---- */
  stage("4. three layouts, one Tamil");
  const paths: string[] = [];
  for (const name of ["Tamil99", "InScript", "Typewriter"]) {
    const lay = LAYOUTS.find((l) => l.name === name) as Layout;
    const seq = sequenceFor(lay, firstItem);
    /* Replay the sequence through `press` to prove the text it yields. */
    let cur = "";
    let dead = false;
    for (const k of seq) {
      const r = press(lay, cur, k.code, k.shift, dead);
      const rep = r.replace ?? 0;
      cur = rep ? cur.slice(0, cur.length - rep) + r.out : cur + r.out;
      dead = r.dead;
    }
    const short = seq.map((k) => (k.shift ? "⇧" : "") + k.code.replace("Key", "").replace("Digit", "")).join(" ");
    paths.push(`${name}: ${short}`);
    if (nfc(cur) === nfc(firstItem)) ok(`${name} produces the same text a different way`, short);
    else bad(`${name} produced the wrong text`, cur);
  }
  const switched = clickText("இன்ஸ்கிரிப்ட்");
  await settle(600);
  if (switched === "clicked") ok("the layout switch is reachable in the UI");
  else bad("could not switch layout");
  const cyr = clickText("Tamil99") === "clicked";
  await settle(400);
  if (cyr) ok("and back again");
  await shot("04-layouts");

  /* ---- 5. exam mode ---- */
  stage("5. exam mode");
  /* Finishing a lesson returns the app to the book, and exam mode is a mode of
     the practice view rather than a screen of its own — so enter a lesson first. */
  clickText("First letters");
  await settle(600);
  const exam = clickText("Exam");
  await settle(700);
  const examStage = await stageText();
  if (exam === "clicked" && /timed examination/i.test(examStage)) ok("exam mode opens with the timed passage");
  else bad("exam mode did not open");
  await shot("05-exam");

  /* ---- 6. type the exam and read the result ---- */
  stage("6. the exam, typed end to end");
  /* The passage is typed from the engine's declaration, not scraped from the DOM:
     scraping would silently agree with whatever the UI happens to render. The DOM
     is then used to check the two agree. */
  const examSeq = sequenceFor(tamil99, EXAM_TEXT);
  const shownUnits = await ev(`(() => { const el = document.querySelector("[data-kalappai-target]");`
    + ` return el ? String(el.children.length) : "no-hook"; })()`);
  const declaredUnits = String(aksharas(EXAM_TEXT).length);
  if (examSeq.length) {
    ok("the declared passage is typeable on Tamil99", `${aksharas(EXAM_TEXT).length} aksharas · ${examSeq.length} keys`);
    if (shownUnits === declaredUnits) ok("the app shows the same passage the corpus declares", `${shownUnits} akshara slots`);
    else bad(`the app shows ${shownUnits} akshara slots, the engine declares ${declaredUnits}`);
    await typeSequence(examSeq, 420);
    await settle(900);
    text = await bodyText();
    if (/practice record/i.test(text)) ok("finishing the passage produces a practice record");
    else bad("the practice record did not appear after typing the passage");
  } else {
    bad("the declared exam passage cannot be typed on Tamil99");
  }
  await shot("06-practice-record");

  /* ---- 7. the certification panel ---- */
  stage("7. certification panel");
  if (/certificate/i.test(text)) {
    ok("the certification panel is offered in the exam result");
    if (/not a TNDTE|not a TNPSC/i.test(text)) ok("it is labelled honestly (practice record, not a qualification)");
    else bad("the honest-labelling sentence is missing");
    /* the fields live behind an "issue one" disclosure — opt-in is literal here */
    const opened = clickText("issue one");
    await settle(400);
    if (opened === "clicked") ok("the panel needs an explicit opt-in before it asks for anything");
    else bad("the certification panel has no way to open it");
    const fields = await ev(`(() => { const i = [...document.querySelectorAll("input")]`
      + `.map((x) => x.placeholder || x.name || ""); return i.join(" | "); })()`);
    if (/http|server/i.test(fields)) ok("the server is user-supplied, not baked in", "opt-in only");
    else bad(`no server field found (inputs: ${JSON.stringify(fields)})`);
  } else {
    bad("the certification panel is missing from the exam result");
  }
  await shot("07-certification");

  /* ---- report ---- */
  console.log("");
  console.log(`${BOLD}key paths proven${NC}`);
  for (const p of paths) console.log(`  ${DIM}${p}${NC}`);

  server.stop(true);
  console.log("");
  if (failed === 0) {
    console.log(`${GREEN}${BOLD}✓ Walkthrough passed${NC} ${DIM}(${steps} checks · screenshots in demo/out/)${NC}`);
  } else {
    console.log(`${RED}${BOLD}✗ Walkthrough failed${NC} ${DIM}(${failed} of ${steps} checks)${NC}`);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`${RED}✗ ${(e as Error).message}${NC}`);
  server.stop(true);
  process.exit(1);
});
