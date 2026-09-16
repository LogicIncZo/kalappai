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
| `POST /api/certificates` | Issue. Body: `{ alias, layoutId, passageId, targetHash, stats: { grossWpm, netWpm, accuracy, errors, strokes, kdph, elapsedMs } }`. Returns `{ id, signature, verifyPath }`. |
| `GET /api/certificates/:id` | JSON verification: full record + `signatureValid`. |
| `GET /certs/:id` | Human verification page. |
| `GET /` | Health. |

`targetHash` is the SHA-256 of the exact passage text the client typed against;
it binds the certificate to a known passage (`exam-60s-v1` in the app).

## Signing

`signature = HMAC-SHA256(secret, sorted-JSON(record-without-signature) + issued_at)`.
Keep `KALAPPAI_CERT_SECRET` stable for the life of your database — losing it
makes every previously issued certificate unverifiable. Without it the server
refuses to start.
