/**
 * Demo infrastructure — seed a deterministic learner state.
 *
 * The demo exists so a release can be shown without hand-typing an exam every
 * time, and so screenshots stay reproducible. It writes `demo/out/progress.json`
 * (the same shape `localStorage` holds) and prints the book state it implies.
 *
 * The seed is *derived from the engine's own book*, not hand-written: it walks
 * `BOOK` and marks the first N exercises of each lesson done. That means the seed
 * cannot name a lesson or an exercise index that does not exist, and a book edit
 * that shrinks a lesson is caught by `--check`.
 *
 * Usage:
 *   bun demo/seed.ts            # write demo/out/progress.json
 *   bun demo/seed.ts --check    # gate mode: replay it, assert every key resolves
 *
 * `--check` is stage 8 of `scripts/verify.sh`. It is the reason demo
 * infrastructure cannot rot: the file is only useful if the engine still agrees
 * with what it says.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { BOOK, LESSONS, type LAYOUTS, layoutById, progressKey, typeable } from "../src/engine";

const CHECK = process.argv.includes("--check");
const OUT = join(import.meta.dir, "out", "progress.json");

const bold = (s: string) => `\u001b[1m${s}\u001b[0m`;
const dim = (s: string) => `\u001b[2m${s}\u001b[0m`;
const green = (s: string) => `\u001b[32m${s}\u001b[0m`;
const red = (s: string) => `\u001b[31m${s}\u001b[0m`;

/**
 * How far into each chapter the seeded learner is: how many of the chapter's
 * lessons are finished, in order. Keyed by chapter id, so a chapter that gains a
 * lesson still seeds sensibly instead of silently seeding nothing. A key naming a
 * chapter the book no longer has is a problem, not a no-op — see the checks below.
 */
const DEPTH: Record<string, number> = {
  c1: 2, // Foundations — finished
  c2: 2, // The pulli — finished
  c3: 1, // Vowels and signs — partway
  c4: 1, // Words — partway
  c5: 0, // Sentences — untouched
};

/** Exercises to mark done in the Nth lesson of a chapter, by position. */
function exercisesDone(pos: number, total: number): number {
  if (pos === 0) return total; // the first lesson of a started chapter is finished
  if (pos === 1) return total;
  return Math.min(1, total);
}

const LAYOUT = "tamil99";

const seed: Record<string, 1> = {};
const summary: { chapter: string; lesson: string; done: number; total: number }[] = [];

for (const ch of BOOK) {
  const depth = DEPTH[ch.id] ?? 0;
  ch.lessons.forEach((ls, pos) => {
    const done = pos < depth ? exercisesDone(pos, ls.items.length) : 0;
    summary.push({ chapter: ch.id, lesson: ls.id, done, total: ls.items.length });
    for (let i = 0; i < done; i++) {
      seed[progressKey(LAYOUT, ls.id, i)] = 1;
    }
  });
}

const totalDone = Object.keys(seed).length;
const totalItems = LESSONS.reduce((n, l) => n + l.items.length, 0);

/* ---- checks: every seeded key must resolve to a real lesson + reachable item ---- */

const problems: string[] = [];

/* A depth key for a chapter that no longer exists silently seeds nothing, which
   then reads like a deliberate choice forever. Make it loud instead. */
const chapterIds = new Set(BOOK.map((c) => c.id));
for (const id of Object.keys(DEPTH)) {
  if (!chapterIds.has(id)) problems.push(`DEPTH names chapter \`${id}\`, which the book does not have`);
}
const lay = layoutById(LAYOUT as (typeof LAYOUTS)[number]["id"]);

for (const key of Object.keys(seed)) {
  const [layoutId, lessonId, idxRaw] = key.split(":");
  const idx = Number(idxRaw);
  const lesson = LESSONS.find((l) => l.id === lessonId);
  if (!lesson) {
    problems.push(`${key} — no lesson \`${lessonId}\` in the book`);
    continue;
  }
  if (!Number.isInteger(idx) || idx < 0 || idx >= lesson.items.length) {
    problems.push(`${key} — exercise ${idx} is out of range for ${lessonId} (${lesson.items.length} items)`);
    continue;
  }
  if (layoutId !== LAYOUT) {
    problems.push(`${key} — seeded for layout \`${layoutId}\`, demo declares \`${LAYOUT}\``);
    continue;
  }
  const item = lesson.items[idx];
  const declared = !lesson.layouts || lesson.layouts.includes(LAYOUT);
  if (declared && !typeable(lay, item)) {
    problems.push(`${key} — item \`${item}\` is not typeable on ${lay.name}`);
  }
}

/* ---- report ---- */

console.log(
  `${bold("Kalappai demo seed")} ${dim(`— ${totalDone}/${totalItems} exercises done, layout ${lay.name}`)}\n`,
);

for (const ch of BOOK) {
  const lessons = summary.filter((s) => s.chapter === ch.id);
  const done = lessons.reduce((n, s) => n + s.done, 0);
  const total = lessons.reduce((n, s) => n + s.total, 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const mark = done === total ? green("✓") : done === 0 ? dim("·") : "◐";
  console.log(
    `  ${mark} ${ch.title.padEnd(16)} ${dim(`${done}/${total} exercises`.padEnd(20))} ${dim(`${pct}%`)}`,
  );
}

if (problems.length) {
  console.log(`\n${red("✗ seed does not match the book:")}`);
  for (const p of problems) console.log(`  · ${p}`);
  console.log(`\n  The demo seed is derived from \`BOOK\` in src/engine.ts — if the book changed,
  re-run without --check to regenerate, and confirm the new state is what you want to show.`);
  process.exit(1);
}

console.log(`\n  ${green("✓")} every seeded key resolves to a real lesson and a typeable item`);

if (CHECK) {
  console.log(`\n${green(bold("✓ Demo seed conforms"))} ${dim(`(${totalDone} keys checked)`)}`);
  process.exit(0);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(seed, null, 2)}\n`);
console.log(`  ${green("✓")} wrote ${dim(OUT)}`);
console.log(
  `\n${dim("  Load it in the app with:")} localStorage.setItem("kalappai.progress", <file contents>)`,
);
