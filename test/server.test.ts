/**
 * Server contract tests — run against a FRESH throwaway DB on a random port.
 * Bun test: `bun test test/test-server.ts`
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createPublicKey, verify } from "node:crypto";

const PORT = 8199 + Math.floor(Math.random() * 100);
const BASE = `http://localhost:${PORT}`;
process.env.KALAPPAI_CERT_DB = "/tmp/kalappai-test-" + Date.now() + ".db";
process.env.PORT = String(PORT);
process.env.KALAPPAI_CERT_SECRET = "test-secret";
process.env.KALAPPAI_CERT_ORIGIN = "https://logicinczo.github.io";

const { default: app } = await import("../server/index.ts");
const server = Bun.serve({ port: PORT, fetch: app.fetch });
afterAll(() => server.stop(true));

function issueBody() {
  return {
    alias: "Test User",
    layoutId: "tamil99",
    passageId: "exam-60s-v1",
    targetHash: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    stats: {
      grossWpm: 21.4, netWpm: 19.8, accuracy: 96.2,
      errors: 3, strokes: 180, kdph: 1100, elapsedMs: 60000,
    },
  };
}

describe("kalappai-cert", () => {
  test("health", async () => {
    const r = await fetch(`${BASE}/`);
    expect(r.status).toBe(200);
  });

  test("issues W3C VC (VC-JWT EdDSA) + OB3-shaped credential, verifiable via JWKS", async () => {
    const r = await fetch(`${BASE}/api/certificates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(issueBody()),
    });
    expect(r.status).toBe(201);
    const issued = (await r.json()) as {
      id: string; verifyUrl: string; vcJwt: string;
      credential: { type: string[]; "@context": string[]; credentialSubject: Record<string, unknown>; issuer: string; validFrom: string };
    };
    expect(issued.credential.type).toContain("VerifiableCredential");
    expect(issued.credential.type).toContain("OpenBadgeCredential");
    expect((issued.credential["@context"] as string[]).some((u) => u.includes("credentials/v2"))).toBe(true);
    const subj = issued.credential.credentialSubject as { name: string; achievement: { name: string } };
    expect(subj.name).toBe("Test User");
    expect(subj.achievement.name).toContain("Tamil99");

    const [h64, p64, sig64] = issued.vcJwt.split(".");
    expect(h64).toBeTruthy();
    const dec = (x: string) => Buffer.from(x.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const head = JSON.parse(dec(h64));
    expect(head.alg).toBe("EdDSA");
    const payload = JSON.parse(dec(p64));
    expect(payload.iss).toContain("/api/issuer");
    expect(payload.vc.credentialSubject.name).toBe("Test User");

    const jw = await (await fetch(`${BASE}/.well-known/jwks.json`)).json();
    const jwk = jw.keys[0];
    expect(jwk.kty).toBe("OKP");
    const pub = createPublicKey({ key: jwk, format: "jwk" });
    const ok = verify(null, Buffer.from(`${h64}.${p64}`), pub, Buffer.from(sig64.replace(/-/g, "+").replace(/_/g, "/"), "base64"));
    expect(ok).toBe(true);

    const page = await fetch(`${BASE}/certs/${issued.id}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("<svg");
    expect(html).toContain("window.print");
    expect(issued.verifyUrl).toContain(`/certs/${issued.id}`);
  });

  test("issue + verify round-trip", async () => {
    const r = await fetch(`${BASE}/api/certificates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(issueBody()),
    });
    expect(r.status).toBe(201);
    const { id } = (await r.json()) as { id: string };

    const v = await fetch(`${BASE}/api/certificates/${id}`);
    const data = (await v.json()) as { signatureValid: boolean; certificate: { net_wpm: number } };
    expect(data.signatureValid).toBe(true);
    expect(data.certificate.net_wpm).toBeCloseTo(19.8);
  });

  test("rejects invalid payloads", async () => {
    const r = await fetch(`${BASE}/api/certificates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alias: "x" }),
    });
    expect(r.status).toBe(400);
  });

  test("enforces pass rules (422 + exact error string)", async () => {
    const b = issueBody();
    b.stats.accuracy = 88;
    const r = await fetch(`${BASE}/api/certificates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(b),
    });
    expect(r.status).toBe(422);
    const j = (await r.json()) as { error: string };
    expect(j.error).toBe("attempt does not meet pass rules");
  });

  test("rejects bad target hash", async () => {
    const b = issueBody();
    (b as any).targetHash = "not-a-hash";
    const r = await fetch(`${BASE}/api/certificates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(b),
    });
    expect(r.status).toBe(400);
  });

  test("detects DB tampering", async () => {
    const r = await fetch(`${BASE}/api/certificates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(issueBody()),
    });
    const { id } = (await r.json()) as { id: string };

    const { Database } = await import("bun:sqlite");
    const db = new Database(process.env.KALAPPAI_CERT_DB!);
    db.query("UPDATE certs SET net_wpm = 99.9 WHERE id = ?").run(id);
    db.close();

    const v = await fetch(`${BASE}/api/certificates/${id}`);
    const data = (await v.json()) as { signatureValid: boolean };
    expect(data.signatureValid).toBe(false);
  });

  test("404 for unknown certificate", async () => {
    const r = await fetch(`${BASE}/api/certificates/does-not-exist`);
    expect(r.status).toBe(404);
  });

  test("CORS preflight allows configured origin", async () => {
    const r = await fetch(`${BASE}/api/certificates`, {
      method: "OPTIONS",
      headers: { "origin": "https://logicinczo.github.io", "access-control-request-method": "POST" },
    });
    expect(r.headers.get("access-control-allow-origin")).toBe("https://logicinczo.github.io");
  });
});
