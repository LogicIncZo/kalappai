/**
 * Kalappai certification service (optional backend).
 *
 * The PWA is fully functional offline without this server. When a learner
 * finishes an exam-mode passage they may submit the result here to get a
 * signed, shareable practice certificate with a public verification URL.
 *
 * Honest framing (per REQUIREMENTS.md): these are *practice* certificates
 * issued by the Kalappai app. They are not TNDTE/TNPSC qualifications.
 *
 * Run:  KALAPPAI_CERT_SECRET=... bun server/index.ts   (PORT env respected)
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Database } from "bun:sqlite";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const PORT = Number(process.env.PORT ?? 8123);
const SECRET = process.env.KALAPPAI_CERT_SECRET ?? "";
const DB_PATH = process.env.KALAPPAI_CERT_DB ?? join(import.meta.dir, "data", "certs.db");
mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS certs (
    id TEXT PRIMARY KEY,
    issued_at INTEGER NOT NULL,
    alias TEXT NOT NULL,
    layout_id TEXT NOT NULL,
    passage_id TEXT NOT NULL,
    target_hash TEXT NOT NULL,
    gross_wpm REAL NOT NULL,
    net_wpm REAL NOT NULL,
    accuracy REAL NOT NULL,
    errors INTEGER NOT NULL,
    strokes INTEGER NOT NULL,
    kdph INTEGER NOT NULL,
    elapsed_ms INTEGER NOT NULL,
    signature TEXT NOT NULL
  );
`);

if (!SECRET) {
  console.warn("[kalappai-cert] KALAPPAI_CERT_SECRET not set — using an ephemeral key. issued signatures will not survive restarts.");
}
const secretAt = (t: number) => SECRET || `ephemeral-${Math.floor(t / 86400000)}`;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const sign = (payload: string, at: number) =>
  createHmac("sha256", secretAt(at)).update(payload).digest("hex");

function canonical(r: Omit<DBRow, "signature">): string {
  const keys = Object.keys(r).sort() as (keyof Omit<DBRow, "signature">)[];
  return keys.map((k) => `${k}=${String(r[k])}`).join("|");
}

function dollar(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) out[`$${k}`] = v;
  return out;
}

type DBRow = {
  id: string; issued_at: number; alias: string; layout_id: string; passage_id: string;
  target_hash: string; gross_wpm: number; net_wpm: number; accuracy: number;
  errors: number; strokes: number; kdph: number; elapsed_ms: number; signature: string;
};

const ID_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
function newId(): string {
  let s = "";
  for (let i = 0; i < 10; i++) s += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  return s;
}

/* naive per-IP limiter: 12 issues / 5 min */
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 5 * 60 * 1000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 12;
}

const num = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

const app = new Hono();
const ALLOW_ORIGIN = process.env.KALAPPAI_CERT_ORIGIN ?? "*";
app.use("*", cors({ origin: ALLOW_ORIGIN }));

app.get("/", (c) => c.json({ service: "kalappai-cert", ok: true, verify: "/certs/:id" }));

app.post("/api/certificates", async (c) => {
  const ip = c.req.header("x-forwarded-for") ?? "local";
  if (limited(ip)) return c.json({ error: "rate limited" }, 429);

  let b: Record<string, unknown>;
  try { b = (await c.req.json()) as Record<string, unknown>; } catch { return c.json({ error: "invalid json" }, 400); }
  const stats = (b.stats ?? {}) as Record<string, unknown>;
  const alias = String(b.alias ?? "").trim().slice(0, 40);
  const layoutId = String(b.layoutId ?? "").trim().slice(0, 20);
  const passageId = String(b.passageId ?? "").trim().slice(0, 40);

  const gross = num(stats.grossWpm, 0, 200);
  const net = num(stats.netWpm, 0, 200);
  const accuracy = num(stats.accuracy, 0, 100);
  const errors = num(stats.errors, 0, 100000);
  const strokes = num(stats.strokes, 1, 1000000);
  const kdph = num(stats.kdph, 0, 100000);
  const elapsedMs = num(stats.elapsedMs, 1000, 6 * 3600 * 1000);
  const targetHash = String(b.targetHash ?? "").match(/^[0-9a-f]{64}$/)?.[0];

  if (!alias || !layoutId || !passageId || !targetHash || gross === null || net === null ||
      accuracy === null || errors === null || strokes === null || kdph === null || elapsedMs === null) {
    return c.json({ error: "invalid certificate request" }, 400);
  }

  const issuedAt = Date.now();
  const base: Omit<DBRow, "signature"> = {
    id: newId(), issued_at: issuedAt, alias, layout_id: layoutId, passage_id: passageId,
    target_hash: targetHash, gross_wpm: Math.round(gross * 100) / 100,
    net_wpm: Math.round(net * 100) / 100, accuracy: Math.round(accuracy * 100) / 100,
    errors, strokes, kdph, elapsed_ms: Math.round(elapsedMs),
  };
  const signature = sign(canonical(base), issuedAt);
  const row: DBRow = { ...base, signature };
  db.query(`INSERT INTO certs VALUES ($id, $issued_at, $alias, $layout_id, $passage_id, $target_hash,
           $gross_wpm, $net_wpm, $accuracy, $errors, $strokes, $kdph, $elapsed_ms, $signature)`).run(dollar(row) as Record<string, string | number>);

  return c.json({ id: row.id, issuedAt, signature, verifyPath: `/certs/${row.id}` }, 201);
});

app.get("/api/certificates/:id", (c) => {
  const row = db.query("SELECT * FROM certs WHERE id = ?").get(c.req.param("id")) as DBRow | null;
  if (!row) return c.json({ error: "not found" }, 404);
  const { signature: _stored, ...payload } = row;
  const recalc = sign(canonical(payload), row.issued_at);
  const a = Buffer.from(recalc);
  const b = Buffer.from(row.signature);
  const valid = a.length === b.length && timingSafeEqual(a, b);
  return c.json({ certificate: row, signatureValid: valid });
});

app.get("/certs/:id", (c) => {
  const id = c.req.param("id");
  const row = db.query("SELECT * FROM certs WHERE id = ?").get(id) as DBRow | null;
  if (!row) return c.html("<title>Kalappai certificate</title><p>Certificate not found.</p>", 404);
  const { signature: _stored2, ...payload2 } = row;
  const recalc = sign(canonical(payload2), row.issued_at);
  const a = Buffer.from(recalc);
  const b = Buffer.from(row.signature);
  const valid = a.length === b.length && timingSafeEqual(a, b);
  const d = (n: number) => new Date(n).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  return c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kalappai practice certificate · ${id}</title>
<style>
  body{font-family:system-ui,sans-serif;background:#12100c;color:#f2e8d5;margin:0;padding:2rem 1rem}
  main{max-width:560px;margin:0 auto;background:rgba(32,28,22,.72);border:1px solid rgba(232,163,61,.18);border-radius:14px;padding:1.6rem}
  h1{font-size:1.15rem;margin:0 0 .2rem;color:#e8a33d}
  table{width:100%;border-collapse:collapse;margin-top:1rem}
  td{padding:.45rem 0;border-bottom:1px solid rgba(232,163,61,.12);font-size:.92rem}
  td:first-child{color:#a09480;width:40%}
  .ok{color:#7fb069;font-weight:600}.bad{color:#e2705f;font-weight:600}
  .note{font-size:.75rem;color:#a09480;margin-top:1rem}
</style></head><body><main>
<h1>கலப்பை · Kalappai practice certificate</h1>
<div>id <code>${id}</code></div>
<p class="${valid ? "ok" : "bad"}">${valid ? "✔ Signature valid — this record has not been altered." : "✘ Signature INVALID — do not trust this record."}</p>
<table>
<tr><td>Issued to</td><td>${row.alias.replace(/</g, "&lt;")}</td></tr>
<tr><td>Layout</td><td>${row.layout_id}</td></tr>
<tr><td>Passage</td><td>${row.passage_id}</td></tr>
<tr><td>Net speed</td><td>${row.net_wpm} wpm (gross ${row.gross_wpm})</td></tr>
<tr><td>Accuracy</td><td>${row.accuracy}% · ${row.errors} errors · ${row.strokes} strokes</td></tr>
<tr><td>Rate</td><td>${row.kdph} keystrokes/hour</td></tr>
<tr><td>Duration</td><td>${Math.round(row.elapsed_ms / 1000)} s</td></tr>
<tr><td>Issued</td><td>${d(row.issued_at)}</td></tr>
<tr><td>Passage hash</td><td style="font-size:.7rem;word-break:break-all">${row.target_hash}</td></tr>
</table>
<p class="note">Practice certificate issued by the open-source Kalappai typing tutor. Not a government
qualification — not a TNDTE or TNPSC certificate. Anyone can verify this page; the signature was
created by the certification server at issue time.</p>
</main></body></html>`);
});

export default { port: PORT, fetch: app.fetch };
