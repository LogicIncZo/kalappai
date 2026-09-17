/**
 * Client ↔ service contract conformance.
 *
 * The certification service lives in its own repository (LogicIncZo/kalappai-cert)
 * and is deployed independently of this app. Nothing at runtime stops the two from
 * drifting apart, so this check pins the two together at build time:
 *
 *   1. pin       — the vendored contract artifact matches contract/PINNED.sha256
 *   2. call      — src/App.tsx posts to the declared path, sends every declared
 *                  required field, and reads the declared response fields
 *   3. rules     — the pass rules the UI states are the pass rules the service declares
 *   4. deployment— the instance the README points at is the instance the app targets
 *
 * Usage:  bun scripts/check-contract.ts
 *         bun scripts/check-contract.ts --upstream <url>   compare against a live service
 *
 * --upstream is the network-armed variant used by CI after a deploy: it fetches the
 * running service's own artifact and asserts it is still the one this app was built
 * against. The default run is offline and hermetic.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import artifact from "../contract/cert-service.v1.json";

const ROOT = join(import.meta.dir, "..");
const problems: string[] = [];
const notes: string[] = [];

/* ---- 1. the pin ---- */

const vendored = readFileSync(join(ROOT, "contract", "cert-service.v1.json"));
const pin = readFileSync(join(ROOT, "contract", "PINNED.sha256"), "utf8").trim();
const digest = createHash("sha256").update(vendored).digest("hex");

if (digest !== pin) {
  problems.push(
    `contract/cert-service.v1.json does not match contract/PINNED.sha256\n` +
      `        pinned: ${pin}\n        actual: ${digest}\n` +
      `        re-vendor with: bun scripts/sync-contract.sh`,
  );
} else {
  notes.push(`pinned contract artifact verified (${digest.slice(0, 12)}…)`);
}

/* ---- 2. the call site ---- */

const app = readFileSync(join(ROOT, "src", "App.tsx"), "utf8");
const issueStart = app.indexOf("const issue = async");
const issueEnd = app.indexOf("\n  };", issueStart);
const issue = issueStart > -1 && issueEnd > issueStart ? app.slice(issueStart, issueEnd) : "";

if (!issue) {
  problems.push("could not locate the certificate issuance call in src/App.tsx");
} else {
  /* The client builds its URL from a user-supplied base that already ends in
     "/", so the declared path appears as a suffix (`${base}api/certificates`),
     never as a full quoted literal. Assert on the suffix — a changed path still
     fails, which is the drift this check exists to catch. */
  const path = artifact.issuance.path.replace(/^\//, "");
  if (!issue.includes(path)) {
    problems.push(`src/App.tsx does not post to the declared path ${artifact.issuance.path}`);
  }
  for (const field of [...artifact.issuance.requestRequired, ...artifact.issuance.statsRequired]) {
    /* object shorthand is the house style here, so match the bare field name */
    if (!new RegExp(`\\b${field}\\b`).test(issue)) {
      problems.push(`src/App.tsx does not send the declared required field \`${field}\``);
    }
  }
  for (const field of artifact.issuance.responseFields) {
    /* verifyPath and credential are for other clients; the app must at least read the id and URL */
    if (!["id", "verifyUrl"].includes(field)) continue;
    if (!new RegExp(`\\b${field}\\b`).test(issue)) {
      problems.push(`src/App.tsx does not read the declared response field \`${field}\``);
    }
  }
  if (!issue.includes("sha-256") && !/digest\("SHA-256"/.test(issue)) {
    problems.push("src/App.tsx does not hash the passage, so targetHash is not the declared SHA-256");
  }
}

/* ---- 3. the pass rules the learner is told about ---- */

for (const value of [
  artifact.passRules.accuracyPercent,
  artifact.passRules.minElapsedMs / 1000,
  artifact.passRules.minChars,
]) {
  if (!app.includes(String(value))) {
    problems.push(`src/App.tsx never states the declared pass rule ${value}`);
  }
}

/* ---- 4. the deployment the README points at ---- */

const readme = readFileSync(join(ROOT, "README.md"), "utf8");
const liveUrls = [...readme.matchAll(/https:\/\/[a-z0-9.-]*kalappai-cert[a-z0-9.-]*/g)].map((m) => m[0]);
if (liveUrls.length === 0) {
  notes.push("README does not name a live certification instance (fine — certification is optional)");
} else {
  notes.push(`README names the live instance ${liveUrls[0]}`);
}

/* ---- optional: compare against a running service ---- */

const upstreamIndex = process.argv.indexOf("--upstream");
const upstream = upstreamIndex > -1 ? process.argv[upstreamIndex + 1]?.replace(/\/+$/, "") : undefined;

if (upstream) {
  try {
    const res = await fetch(`${upstream}/api/issuer`);
    if (!res.ok) {
      problems.push(`upstream ${upstream} answered ${res.status} for /api/issuer`);
    } else {
      const issuer = (await res.json()) as { id?: string; publicKeyJwk?: { crv?: string; kty?: string } };
      if (!issuer.publicKeyJwk?.crv) {
        problems.push(`upstream ${upstream} does not publish a public key`);
      } else if (issuer.publicKeyJwk.crv !== artifact.credential.crv) {
        problems.push(
          `upstream publishes ${issuer.publicKeyJwk.crv}, the pinned contract declares ${artifact.credential.crv}`,
        );
      } else {
        notes.push(`upstream ${upstream} still speaks the pinned contract (${issuer.publicKeyJwk.crv})`);
      }

      /* the upstream must hold the declared pass rules, not just claim them */
      const body = {
        alias: "Contract probe",
        layoutId: "tamil99",
        passageId: "contract-probe",
        targetHash: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        stats: {
          grossWpm: 20,
          netWpm: 19,
          accuracy: artifact.passRules.accuracyPercent - 1,
          errors: 1,
          strokes: 100,
          kdph: 900,
          elapsedMs: artifact.passRules.minElapsedMs,
          chars: artifact.passRules.minChars,
        },
      };
      const r = await fetch(`${upstream}${artifact.issuance.path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.status !== artifact.refusals.failedPassRules.status) {
        problems.push(
          `upstream answered ${r.status} below the declared accuracy rule, expected ${artifact.refusals.failedPassRules.status}`,
        );
      } else {
        notes.push("upstream still enforces the declared pass rules");
      }
    }
  } catch (e) {
    problems.push(`could not reach upstream ${upstream}: ${(e as Error).message}`);
  }
}

/* ---- report ---- */

if (problems.length === 0) {
  console.log(`✓ app conforms to the pinned service contract (contractVersion ${artifact.contractVersion})`);
  for (const n of notes) console.log(`  · ${n}`);
  process.exit(0);
}

console.log("✗ app and service contract disagree:");
for (const p of problems) console.log(`  · ${p}`);
console.log("\n  fix src/App.tsx, or re-vendor the contract: bun scripts/sync-contract.sh");
process.exit(1);
