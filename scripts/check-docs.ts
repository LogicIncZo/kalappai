/**
 * Docs ↔ code consistency.
 *
 * The README makes countable claims about the engine — how many lessons,
 * chapters, exercises, layouts, golden cases and self-check pairs exist. Every
 * one of those is derived here from the source that ships, so a claim that
 * drifts from the code fails the gate instead of being discovered by a learner.
 *
 * Usage: bun scripts/check-docs.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BOOK, LESSONS, LAYOUTS, selfCheck } from "../src/engine";
import { GOLDEN_TAMIL99, GOLDEN_TRANSLIT, GOLDEN_TOTAL } from "../test/golden";

const ROOT = join(import.meta.dir, "..");
const README = readFileSync(join(ROOT, "README.md"), "utf8");
const AGENTS = (() => {
  try {
    return readFileSync(join(ROOT, "AGENTS.md"), "utf8");
  } catch {
    return "";
  }
})();

const problems: string[] = [];

const facts = {
  chapters: BOOK.length,
  lessons: LESSONS.length,
  exercises: LESSONS.reduce((n, l) => n + l.items.length, 0),
  layouts: LAYOUTS.length,
  pairs: selfCheck().lines.length,
  goldenTamil99: GOLDEN_TAMIL99.length,
  goldenTranslit: GOLDEN_TRANSLIT.length,
  golden: GOLDEN_TOTAL,
};

/** Require `<number> <noun>` in the README and require the number to be right. */
function claim(re: RegExp, actual: number, what: string) {
  const m = README.match(re);
  if (!m) {
    problems.push(`README does not state ${what} (expected ${actual})`);
    return;
  }
  const stated = Number(m[1]);
  if (stated !== actual) {
    problems.push(`README says ${stated} ${what}, the code says ${actual}`);
  }
}

claim(/(\d+)\s+lessons/, facts.lessons, "lessons");
claim(/(\d+)\s+chapters/, facts.chapters, "chapters");
claim(/(\d+)\s+exercises/, facts.exercises, "exercises");
claim(/(\d+)\s+self-check pairs/, facts.pairs, "self-check pairs");
claim(/(\d+)\s+golden cases/, facts.golden, "golden cases");

/* Every layout the engine ships must be named in the README's layout table. */
for (const lay of LAYOUTS) {
  if (!README.includes(lay.name)) {
    problems.push(`layout "${lay.name}" ships but the README never names it`);
  }
}

/* Every command the docs tell a person to run must exist. A phantom script is a
   broken instruction, and it is exactly the kind of drift that prose hides: the
   README once told the reader to run `bun run demo`, which was never defined. */
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};
const scripts = Object.keys(pkg.scripts ?? {});
const commandRe = /bun run ([a-z][a-z0-9:_-]*)/g;
for (const [name, text] of [
  ["README.md", README],
  ["AGENTS.md", AGENTS],
] as Array<[string, string]>) {
  if (name === "AGENTS.md" && !text) continue;
  const seen = new Set<string>();
  for (const m of text.matchAll(commandRe)) {
    const script = m[1];
    if (seen.has(script)) continue;
    seen.add(script);
    if (!scripts.includes(script)) {
      problems.push(`${name} tells the reader to run \`bun run ${script}\`, which package.json does not define`);
    }
  }
}

/* The gate is the contract between a change and a commit: both files must say so. */
for (const [name, text] of [
  ["README.md", README],
  ["AGENTS.md", AGENTS],
] as Array<[string, string]>) {
  if (name === "AGENTS.md" && !text) continue;
  if (!text.includes("bun run verify")) {
    problems.push(`${name} does not name the gate command (\`bun run verify\`)`);
  }
}

if (problems.length === 0) {
  console.log(
    `✓ docs match the code (${facts.chapters} chapters · ${facts.lessons} lessons · ${facts.exercises} exercises · ` +
      `${facts.layouts} layouts · ${facts.pairs} self-check pairs · ${facts.golden} golden cases)`,
  );
  process.exit(0);
}

console.log("✗ docs and code disagree:");
for (const p of problems) console.log(`  · ${p}`);
console.log("\n  fix README.md, or the engine/test data the claim is derived from.");
process.exit(1);
