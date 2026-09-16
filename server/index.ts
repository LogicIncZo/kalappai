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
import QRCode from "qrcode";
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

/* ---- Verifiable-credential issuer key (Ed25519, persisted) ---- */
import { generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify, createPublicKey, createPrivateKey } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const envBase = process.env.KALAPPAI_CERT_BASE ?? "";
const fileBase = (() => {
  try { return readFileSync(join(import.meta.dir, "data", "base-url"), "utf8").trim(); } catch { return ""; }
})();
const BASE = (envBase || fileBase || `http://localhost:${PORT}`).replace(/\/+$/, "");
const KID = "kalappai-issuer-1";
const KEY_PATH = join(dirname(DB_PATH), "issuer-key.json");
type IssuerJwks = { kid: string; privateJwk: Record<string, unknown>; publicJwk: Record<string, unknown> };
function loadIssuerKey(): IssuerJwks {
  if (existsSync(KEY_PATH)) {
    try { return JSON.parse(readFileSync(KEY_PATH, "utf8")) as IssuerJwks; } catch { /* fall through */ }
  }
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
  const priv = privateKey.export({ format: "jwk" }) as Record<string, unknown>;
  const jwks: IssuerJwks = { kid: KID, privateJwk: priv, publicJwk: pub };
  mkdirSync(dirname(KEY_PATH), { recursive: true });
  writeFileSync(KEY_PATH, JSON.stringify(jwks), { mode: 0o600 });
  return jwks;
}
const ISSUER_KEY = loadIssuerKey();
const ISSUER_ID = `${BASE}/api/issuer`;

const b64url = (data: Buffer | string) =>
  Buffer.from(data).toString("base64url");
const privateKey = createPrivateKey({ key: ISSUER_KEY.privateJwk as never, format: "jwk" });
const publicKey = createPublicKey({ key: ISSUER_KEY.publicJwk as never, format: "jwk" });

function vcJwt(credential: Record<string, unknown>, verifyUrl: string, issuedAt: number): string {
  const header = b64url(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: ISSUER_KEY.kid }));
  const payload = b64url(JSON.stringify({
    iss: ISSUER_ID, jti: verifyUrl, nbf: Math.floor(issuedAt / 1000), vc: credential,
  }));
  const sig = cryptoSign(null, Buffer.from(`${header}.${payload}`), privateKey);
  return `${header}.${payload}.${b64url(sig)}`;
}

export function verifyVcJwt(token: string): { valid: boolean; credential?: Record<string, unknown> } {
  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false };
  const input = Buffer.from(`${parts[0]}.${parts[1]}`);
  const sig = Buffer.from(parts[2], "base64url");
  const ok = cryptoVerify(null, input, publicKey, sig);
  if (!ok) return { valid: false };
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { vc?: Record<string, unknown> };
    return { valid: true, credential: payload.vc };
  } catch { return { valid: false }; }
}

function ob3Credential(row: DBRow): Record<string, unknown> {
  const verifyUrl = `${BASE}/certs/${row.id}`;
  const layoutNames: Record<string, string> = {
    tamil99: "Tamil99", inscript: "InScript", typewriter: "Tamil Typewriter", translit: "Phonetic (transliteration)",
  };
  return {
    "@context": ["https://www.w3.org/ns/credentials/v2", "https://purl.imsglobal.org/spec/ob/v3p0/context.json"],
    id: verifyUrl,
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    issuer: ISSUER_ID,
    validFrom: new Date(row.issued_at).toISOString(),
    credentialSubject: {
      id: `urn:kalappai:learner:${row.id}`,
      type: ["AchievementSubject"],
      name: row.alias,
      achievement: {
        type: ["Achievement"],
        name: `Kalappai Typing Exam — ${layoutNames[row.layout_id] ?? row.layout_id} (${Math.round(row.elapsed_ms / 1000)} s)`,
        description: "Self-administered, unproctored typing exam passage completed in the open-source Kalappai Tamil typing tutor.",
        criteria: { type: ["Criteria"], narrative: "Type the exam passage within the timed window with at least 90% accuracy (minimum 30 s and 120 characters); the recorded score is signed by the certification server at issue time." },
      },
      grossWpm: row.gross_wpm, netWpm: row.net_wpm, accuracy: row.accuracy,
      errors: row.errors, strokes: row.strokes, kdph: row.kdph,
      elapsedMs: row.elapsed_ms, passageId: row.passage_id, passageSha256: row.target_hash,
    },
  };
}

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
  const chars = num(stats.chars, 0, 100000);
  const targetHash = String(b.targetHash ?? "").match(/^[0-9a-f]{64}$/)?.[0];

  if (!alias || !layoutId || !passageId || !targetHash || gross === null || net === null ||
      accuracy === null || errors === null || strokes === null || kdph === null || elapsedMs === null) {
    return c.json({ error: "invalid certificate request" }, 400);
  }

  const PASS = { accuracy: 90, elapsedMs: 30_000, chars: 120 };
  if (accuracy < PASS.accuracy || elapsedMs < PASS.elapsedMs || (chars !== null && chars < PASS.chars)) {
    return c.json({ error: "attempt does not meet pass rules" }, 422);
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

  const credential = ob3Credential(row);
  const verifyUrl = `${BASE}/certs/${row.id}`;
  return c.json({ id: row.id, issuedAt, signature, verifyPath: `/certs/${row.id}`, verifyUrl, credential, vcJwt: vcJwt(credential, verifyUrl, issuedAt) }, 201);
});

app.get("/api/issuer", (c) =>
  c.json({
    id: ISSUER_ID, type: ["Issuer"], name: "Kalappai (கலப்பை)",
    url: "https://logicinczo.github.io/kalappai/",
    publicKeyJwk: { ...ISSUER_KEY.publicJwk, kid: ISSUER_KEY.kid },
  }));

app.get("/.well-known/jwks.json", (c) =>
  c.json({ keys: [{ kty: "OKP", crv: "Ed25519", kid: ISSUER_KEY.kid, x: (ISSUER_KEY.publicJwk as { x?: string }).x, alg: "EdDSA", use: "sig" }] }));

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

app.get("/certs/:id", async (c) => {
  const id = c.req.param("id");
  const row = db.query("SELECT * FROM certs WHERE id = ?").get(id) as DBRow | null;
  if (!row) return c.html("<title>Kalappai certificate</title><p>Certificate not found.</p>", 404);
  const { signature: _stored2, ...payload2 } = row;
  const recalc = sign(canonical(payload2), row.issued_at);
  const a = Buffer.from(recalc);
  const b = Buffer.from(row.signature);
  const valid = a.length === b.length && timingSafeEqual(a, b);
  const d = (n: number) => new Date(n).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const verifyUrl = `${BASE}/certs/${id}`;
  const qrSvg = valid ? await QRCode.toString(verifyUrl, { type: "svg", margin: 0, width: 148 }) : "";
  const vcJwtB64 = valid ? `data:text/plain;charset=utf-8,${encodeURIComponent(vcJwt(ob3Credential(row), verifyUrl, row.issued_at))}` : "#";
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
  .qr{background:#fff;padding:.6rem;border-radius:8px;display:inline-block;margin-top:1rem}
  .actions{margin-top:1.1rem;display:flex;gap:.6rem;flex-wrap:wrap}
  .actions button,.actions a{font:inherit;font-size:.85rem;padding:.45rem .8rem;border-radius:8px;border:1px solid rgba(232,163,61,.4);color:#e8a33d;background:none;text-decoration:none}
  .actions button{cursor:pointer}
  @media print{
    body{background:#fff;color:#111;padding:0}
    main{max-width:none;border:1px solid #999;background:#fff;border-radius:0}
    .qr{border:1px solid #ccc}
    .noprint{display:none !important}
    h1{color:#8a5a10}
    td,td:first-child{color:#111;border-bottom-color:#bbb}
    .note{color:#555}
    .ok{color:#1d5a12}.bad{color:#8f1f10}
  }
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
created by the certification server at issue time. Credential format: W3C Verifiable Credential 2.0
(VC-JWT, EdDSA) with an Open Badges 3.0-shaped achievement. Self-administered exam — no proctoring.</p>
</main>
<div class="qr" title="Scan to verify">${qrSvg}</div>
<div class="actions noprint">
  <button onclick="window.print()">Print / அச்சிடு</button>
  <a href="${vcJwtB64}" download="kalappai-${id}.vcjwt.txt">Download credential (VC-JWT)</a>
</div>
</body></html>`);
});

export default { port: PORT, fetch: app.fetch };
