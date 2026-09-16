# Kalappai certification server

Optional, tiny (Hono + SQLite, zero external deps beyond `hono`). Issues
**verifiable practice certificates** for exam-mode results and serves a public
verification page per certificate. Practice-grade only — it is not a TNDTE or
TNPSC certificate, and the app says so wherever it appears.

## What it does (and doesn't) trust

The client reports its own keystroke statistics. The server cannot verify they
were produced by honest typing — nobody's can, remotely. So the server's job is
**integrity of issuance, not proof of skill**: once a result is issued, the
signature makes any later tampering of the stored record detectable. The
signature covers every stored field; the verify endpoint recomputes it and
reports `signatureValid: true/false`.

## Run

```sh
KALAPPAI_CERT_SECRET=$(openssl rand -hex 32) bun server/index.ts
# PORT (default 8123), KALAPPAI_CERT_DB (default server/data/certs.db),
# KALAPPAI_CERT_ORIGIN (CORS allow-origin; default "*") are honoured.
```

Tests: `bun test ./test/test-server.ts` (spawns its own instance on a random
port; never touches your data directory).

## API

| Method & path | Purpose |
| --- | --- |
| `POST /api/certificates` | Issue. Body: `{ alias, layoutId, passageId, targetHash, chars, stats: { grossWpm, netWpm, accuracy, errors, strokes, kdph, elapsedMs, chars } }`. Enforces pass rules (accuracy ≥ 90 %, elapsed ≥ 30 s, chars ≥ 120) → `422` otherwise. Returns `{ id, signature, verifyPath, verifyUrl, credential, vcJwt }`. |
| `GET /api/certificates/:id` | JSON verification: full record + `signatureValid` (HMAC tamper check). |
| `GET /api/issuer` | Open Badges 3.0 issuer profile + Ed25519 public key (JWK). |
| `GET /.well-known/jwks.json` | JWKS for verifying issued VC-JWTs offline. |
| `GET /certs/:id` | Human verification page: QR code, print button, VC-JWT download. |
| `GET /` | Health. |

`targetHash` is the SHA-256 of the exact passage text the client typed against;
it binds the certificate to a known passage (`exam-60s-v1` in the app).

## Signing (two independent layers)

1. **HMAC tamper-evidence (database):** `signature = HMAC-SHA256(secret, canonical(record-without-signature) + issued_at)`. The verify endpoint re-derives it from the stored row, so silent DB edits are detected.
2. **Ed25519 VC-JWT (credential):** each certificate is also issued as a W3C
   Verifiable Credential (VC 2.0, JWT proof format, `EdDSA`) carrying an
   Open Badges 3.0-shaped achievement. Verify offline with `/.well-known/jwks.json`
   (e.g. `joze verify` or any JWT library).

Keep `KALAPPAI_CERT_SECRET` stable for the life of your database — losing it
makes the HMAC layer unverifiable for old records. The Ed25519 issuer key is
generated once and stored at `${KALAPPAI_CERT_DB_DIR}/issuer-key.json` (mode 0600);
back it up if third parties will verify old certificates offline.

## Environment

| Variable | Purpose |
| --- | --- |
| `KALAPPAI_CERT_SECRET` | HMAC secret (required for persistent HMAC validity). |
| `KALAPPAI_CERT_BASE` | Public base URL used in `verifyUrl`, credential ids and QR codes. |
| `KALAPPAI_CERT_ORIGIN` | CORS allow-origin (e.g. the PWA's GitHub Pages origin). |
| `KALAPPAI_CERT_DB` | SQLite database path (directory also holds `issuer-key.json`). |
| `PORT` | Listen port (default 8123). |
