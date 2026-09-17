/**
 * Deployment-side gate (the CD half of the loop).
 *
 * Where `scripts/smoke-dist.ts` proves a freshly built `dist/` behaves, this proves
 * the thing actually SERVING behaves — and that it is *this commit's* build. It is
 * the check that catches the failure the local gate cannot see: a push that passed
 * every stage but never reached the edge, or reached it as an older bundle.
 *
 * Two surfaces are probed, because the app depends on both:
 *
 *   1. the deployed PWA (GitHub Pages) — is the shell there, are its assets
 *      rooted at the base path, and do the asset filenames match the local `dist/`
 *      byte-for-byte (so "deployed" and "committed build" are the same thing);
 *   2. the deployed certification service — does it still satisfy the PINNED
 *      contract, field by field. The app is a client of a service it does not
 *      control, so this is the check that notices the service moving under it.
 *
 * Deliberately NON-MUTATING against the service: every write-shaped probe is one
 * that must be REFUSED (missing field, failed pass rules, impossible stats), so a
 * run against production never mints a certificate and never consumes the
 * issuance budget of a real learner. There is no "issue a real one" mode on
 * purpose.
 *
 * Usage:
 *   bun scripts/smoke-live.ts                       # default live URLs
 *   bun scripts/smoke-live.ts --pages URL --cert URL
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import artifact from "../contract/cert-service.v1.json";

const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const DEFAULT_PAGES = "https://logicinczo.github.io/kalappai/";
const DEFAULT_CERT = "https://kalappai-cert-cashlessconsumer.zocomputer.io";

function flag(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const pages = (flag("pages") ?? process.env.KALAPPAI_PAGES_BASE ?? DEFAULT_PAGES).replace(/\/+$/, "");
const cert = (flag("cert") ?? process.env.KALAPPAI_CERT_BASE ?? DEFAULT_CERT).replace(/\/+$/, "");

const bold = (s: string) => `\u001b[1m${s}\u001b[0m`;
const dim = (s: string) => `\u001b[2m${s}\u001b[0m`;
const green = (s: string) => `\u001b[32m${s}\u001b[0m`;
const red = (s: string) => `\u001b[31m${s}\u001b[0m`;

let failed = 0;

function pass(label: string, detail = "") {
  console.log(`  ${green("✓")} ${label}${detail ? ` ${dim(`(${detail})`)}` : ""}`);
}
function fail(label: string, detail = "") {
  failed++;
  console.log(`  ${red("✗")} ${label}${detail ? ` ${dim(`(${detail})`)}` : ""}`);
}
function section(title: string) {
  console.log(`\n${bold(title)}`);
}

/** Asset filenames a shell references, e.g. `assets/index-BjzUHloi.js`. */
function referencedAssets(html: string): string[] {
  const out = new Set<string>();
  const re = /(?:src|href)="([^"]+)"/g;
  for (const m of html.matchAll(re)) {
    const url = m[1];
    const idx = url.indexOf("assets/");
    if (idx >= 0) out.add(url.slice(idx));
  }
  return [...out].sort();
}

/* =========================== 1. the deployed PWA =========================== */

console.log(`${bold("Deployed-site conformance")} ${dim(`— ${pages}`)}`);

if (!existsSync(DIST)) {
  console.log(`\n${red("dist/ is missing")} — run \`bun run build\` first; this gate compares the`);
  console.log(`deployed bundle to the one this commit builds.\n`);
  process.exit(1);
}

const localHtml = readFileSync(join(DIST, "index.html"), "utf8");
const localAssets = referencedAssets(localHtml);

section("deployed build identity");

let liveHtml = "";
try {
  const r = await fetch(`${pages}/`);
  liveHtml = await r.text();
  if (r.status === 200) pass("the deployment serves the app shell", `200 · ${liveHtml.length} bytes`);
  else fail("the deployment serves the app shell", `HTTP ${r.status}`);
} catch (e) {
  fail("the deployment serves the app shell", (e as Error).message);
}

if (liveHtml) {
  const liveAssets = referencedAssets(liveHtml);
  const missing = localAssets.filter((a) => !liveAssets.includes(a));
  const extra = liveAssets.filter((a) => !localAssets.includes(a));

  if (!localAssets.length) {
    fail("the local build references hashed assets", "none found in dist/index.html");
  } else if (!missing.length && !extra.length) {
    pass("the deployment is this commit's build", `${localAssets.length} assets match exactly`);
  } else if (missing.length) {
    fail(
      "the deployment is this commit's build",
      `deployed is behind: ${missing.length} asset(s) not served — redeploy`,
    );
    for (const m of missing.slice(0, 3)) console.log(`      ${dim(`missing: ${m}`)}`);
  } else {
    pass("the deployment is this commit's build", "same assets (extra entries are prior hashes)");
    for (const e of extra.slice(0, 2)) console.log(`      ${dim(`also served: ${e}`)}`);
  }

  const bundle = liveAssets.find((a) => a.endsWith(".js"));
  if (bundle) {
    try {
      const r = await fetch(`${pages}/${bundle}`);
      const text = await r.text();
      const bad = [
        /localhost:\d+/,
        /127\.0\.0\.1/,
        /sourceMappingURL/,
      ].filter((re) => re.test(text));
      if (r.status === 200 && !bad.length) {
        pass("the deployed bundle carries no dev-only references", `${bundle.split("/").pop()}`);
      } else if (r.status !== 200) {
        fail("the deployed bundle is fetchable", `HTTP ${r.status}`);
      } else {
        fail("the deployed bundle carries no dev-only references", `${bad.length} match(es)`);
      }
    } catch (e) {
      fail("the deployed bundle is fetchable", (e as Error).message);
    }
  }
}

section("installed-app surface");

try {
  const r = await fetch(`${pages}/manifest.webmanifest`);
  if (r.status !== 200) {
    fail("the deployed manifest is served", `HTTP ${r.status}`);
  } else {
    const m = (await r.json()) as { name?: string; start_url?: string; display?: string; scope?: string };
    const okDisplay = m.display === "standalone";
    if (okDisplay) pass("the deployed manifest is installable", `${m.name} · ${m.display}`);
    else fail("the deployed manifest is installable", `display=${m.display}`);
    if (m.scope === "/kalappai/") pass("the manifest scope matches the deployment path", m.scope);
    else fail("the manifest scope matches the deployment path", `scope=${m.scope}`);
  }
} catch (e) {
  fail("the deployed manifest is served", (e as Error).message);
}

try {
  const r = await fetch(`${pages}/sw.js`);
  const body = r.status === 200 ? await r.text() : "";
  if (r.status === 200 && body.length > 0) pass("the deployed service worker is served", `${body.length} bytes`);
  else fail("the deployed service worker is served", `HTTP ${r.status}`);
} catch (e) {
  fail("the deployed service worker is served", (e as Error).message);
}

/* ==================== 2. the deployed certification service ==================== */
/* Every claim below is read from the PINNED contract artifact, not from this
   script — so the gate fails when the service drifts from the contract the app
   vendored, which is the only thing the app can actually rely on. */

console.log(`\n${bold("Certification-service conformance")} ${dim(`— ${cert}`)}`);
console.log(`${dim(`  contract ${artifact.name} v${artifact.contractVersion}, declared in ${artifact.declaredIn}`)}`);

section("declared routes");

for (const route of artifact.routes) {
  const path = route.path.replace(":id", "smoke-live-absent-id");
  const url = `${cert}${path}`;
  const opts: RequestInit = { method: route.method };
  if (route.method === "POST") {
    opts.headers = { "content-type": "application/json", "x-forwarded-for": "kalappai-live-probe" };
    opts.body = "{}"; // must be refused: a route that accepts this is not the declared route
  }
  try {
    const r = await fetch(url, opts);
    const want: number[] = route.probe.expect;
    if (want.includes(r.status)) {
      pass(`${route.method} ${route.path}`, `${r.status} · ${route.purpose}`);
    } else {
      fail(`${route.method} ${route.path}`, `expected ${want.join("/")}, got ${r.status}`);
    }
    if (route.probe.json && r.status !== 204) {
      const ct = r.headers.get("content-type") ?? "";
      if (!ct.includes("json")) fail(`  ↳ ${route.path} answers JSON`, ct || "no content-type");
    }
  } catch (e) {
    fail(`${route.method} ${route.path}`, (e as Error).message);
  }
}

section("identity and key material");

try {
  const r = await fetch(`${cert}/.well-known/jwks.json`);
  const jwks = (await r.json()) as { keys?: Array<Record<string, unknown>> };
  const key = jwks.keys?.[0];
  if (key && key.crv === "Ed25519" && key.kty === "OKP" && typeof key.x === "string" && key.x.length > 20) {
    pass("the deployed JWKS publishes an Ed25519 key", `kid ${key.kid}`);
  } else {
    fail("the deployed JWKS publishes an Ed25519 key", JSON.stringify(key ?? {}).slice(0, 80));
  }
} catch (e) {
  fail("the deployed JWKS publishes an Ed25519 key", (e as Error).message);
}

/* ---- pass rules are enforced, and refused at the declared status ---- */

section("pass rules (refusals only — nothing is issued)");

const validStats = {
  grossWpm: 21.4,
  netWpm: 19.8,
  accuracy: 96.2,
  errors: 3,
  strokes: 180,
  kdph: 1100,
  elapsedMs: 60_000,
  chars: 145,
};

async function attempt(overrides: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  const payload = {
    alias: "live-probe",
    layoutId: "tamil99",
    passageId: "exam-60s-v1",
    targetHash: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    stats: { ...validStats, ...((overrides.stats as Record<string, unknown>) ?? {}) },
    ...Object.fromEntries(Object.entries(overrides).filter(([k]) => k !== "stats")),
  };
  const r = await fetch(`${cert}${artifact.issuance.path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "kalappai-live-probe" },
    body: JSON.stringify(payload),
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await r.json()) as Record<string, unknown>;
  } catch {
    /* a non-JSON refusal is itself a finding */
  }
  return { status: r.status, json };
}

/** Assert a refusal comes back at the declared status with the declared message. */
function expectRefusal(label: string, got: { status: number; json: Record<string, unknown> }, want: { status: number; error: string }) {
  if (got.status !== want.status) {
    fail(label, `expected ${want.status}, got ${got.status}`);
    return;
  }
  if (got.json.error !== want.error) {
    fail(label, `${want.status} but message "${String(got.json.error)}" ≠ "${want.error}"`);
    return;
  }
  pass(label, `${got.status} · ${want.error}`);
}

const { accuracyPercent, minElapsedMs, minChars } = artifact.passRules;

const belowAccuracy = await attempt({ stats: { accuracy: Math.max(0, accuracyPercent - 5) } });
expectRefusal(`accuracy below ${accuracyPercent}% is refused`, belowAccuracy, artifact.refusals.failedPassRules);

const tooShort = await attempt({
  stats: { elapsedMs: Math.floor(minElapsedMs / 2), chars: minChars + 5 },
});
expectRefusal(`attempts shorter than ${minElapsedMs / 1000}s are refused`, tooShort, artifact.refusals.failedPassRules);

const tooFewChars = await attempt({ stats: { chars: Math.max(0, minChars - 10) } });
expectRefusal(`attempts under ${minChars} characters are refused`, tooFewChars, artifact.refusals.failedPassRules);

const omittedField = await attempt({ stats: { chars: undefined } as Record<string, unknown> });
expectRefusal(
  "an omitted required stat cannot skip its rule",
  omittedField,
  artifact.refusals.invalidRequest,
);

const impossible = await attempt({ stats: { grossWpm: 10, netWpm: 40 } });
expectRefusal("impossible stats (net > gross) are refused", impossible, artifact.refusals.implausibleStats);

try {
  const r = await fetch(`${cert}${artifact.issuance.path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "kalappai-live-probe" },
    body: "not json{",
  });
  const j = (await r.json()) as Record<string, unknown>;
  expectRefusal("invalid JSON is refused", { status: r.status, json: j }, artifact.refusals.invalidJson);
} catch (e) {
  fail("invalid JSON is refused", (e as Error).message);
}

/* ============================== summary ============================== */

console.log("");
if (failed === 0) {
  console.log(
    `${green(bold("✓ Deployment conforms"))} ${dim(
      `— the deployed PWA is this commit's build, and the certification service still satisfies contract v${artifact.contractVersion}`,
    )}`,
  );
} else {
  console.log(`${red(bold(`✗ Deployment conformance failed (${failed} check${failed === 1 ? "" : "s"})`))}`);
}
console.log("");
process.exit(failed === 0 ? 0 : 1);
