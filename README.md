# Kalappai (கலப்பை) — Tamil-first typing tutor

**Learn Tamil99, InScript, Tamil Typewriter and Phonetic (transliteration) typing in the browser.**
Open source (GPL-3.0-or-later), installable PWA, works offline, no accounts.

**Live: https://logicinczo.github.io/kalappai/** · Practice-certificate service is optional (below).

Named after the plough — the tool that turns soil into speech.

## Why

Existing typing-test sites drill speed; none teach. Kalappai is a *tutor*: 13 lessons in
5 chapters (59 exercises), one key per akshara, per-keystroke "why that key did that"
explainers naming the rule from the layout's own source, and exam mode with
TNDTE-style scoring (gross/net WPM, accuracy, KDPH — metrics hidden until the bell).

The engine is the claim: **the browser owns the keystroke.** No OS keyboard is
installed; physical keys are read via `event.code` and passed through each layout's
own rule machine. Three incompatible layouts, one page.

| Layout | Mechanism | Reference proven from |
| --- | --- | --- |
| Tamil99 (extended) | modifier + dead-key rule machine | thamizha Tamil99 Extended (Keyman, MIT) |
| InScript | stateless, shift-levels | `xkb-data` `symbols/in` `tam` variant |
| Tamil Typewriter | stateless reordering | thamizha New Typewriter (Keyman, MIT) |
| Phonetic | ordered rewrite rules, buffer-tail re-editing | jquery.ime `ta-transliteration` (GPL) |

Layout rules whose provenance cannot be pinned to a source are labelled
*practice-only* in the UI. Full provenance: [NOTICE.md](NOTICE.md).

## Features

- **Lesson book** — foundations → pulli → vowels/signs → speed → real passages.
  Finish an exercise and the next unlocks; progress saved per layout, per device.
- **Learn mode** — sounds-not-shapes teaching, finger assignment, next-key hints,
  rule explainer for every keystroke.
- **Exam mode** — 60s TNDTE-style passage, metrics hidden until completion,
  KDPH + net WPM scoring, honest "practice record" labelling.
- **Optional certification** — run the bundled server and learners can mint a
  signed, tamper-evident practice certificate with a public verification page.
- **PWA** — installable, offline after first load (lessons, engine, UI all local).
- **Local-first** — no accounts, no telemetry; progress in `localStorage`.

## Development

```sh
bun install
bun run dev        # vite dev server
bun test           # engine (169 self-check pairs + 30 golden cases) + server tests
bun run build      # typecheck + PWA build to dist/
```

Engine, layouts and lesson data live in `src/engine.ts` (single file by design —
inspectable, diffable, verifiable). `test/engine.test.ts` replays a golden corpus
against the same source that ships.

## Certification service (optional)

The app is fully functional offline with no server. If you want signed practice
certificates with public verification:

```sh
KALAPPAI_CERT_SECRET=$(openssl rand -hex 32) bun server/index.ts
# :8123 — POST /api/certificates, GET /api/certificates/:id, GET /certs/:id
```

- Each issued certificate is **both** an HMAC-protected database record **and**
  a W3C **Verifiable Credential** (VC 2.0 JWT proof, EdDSA) carrying an
  **Open Badges 3.0**-shaped achievement with the learner-entered name.
- The public verify page (`/certs/:id`) renders a QR code pointing back at
  itself, a print button (print-ready certificate layout), and the raw VC-JWT
  for offline verification against `/.well-known/jwks.json`.
- Standards: OB 3.0 (1EdTech) shape, VC 2.0 (W3C), EdDSA/Ed25519 (RFC 8032).
  Pass rules enforced server-side (accuracy ≥ 90 %, ≥ 30 s, ≥ 120 chars).
- Configure `KALAPPAI_CERT_BASE` (public URL — it appears in QR codes and
  credential ids), `KALAPPAI_CERT_ORIGIN` (CORS), `KALAPPAI_CERT_DB`, `PORT`.
- Live instance: https://kalappai-cert-cashlessconsumer.zocomputer.io
- A certificate from Kalappai is a **practice record**, not a government
  qualification — the UI says so wherever one is issued or verified.

## Docs

- [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) — what and why (FR/NFR, personas)
- [docs/SPECIFICATIONS.md](docs/SPECIFICATIONS.md) — how (layout IR, engine
  semantics, verification strategy, provenance register)
- [docs/ref/](docs/ref/) — pinned upstream reference sources

## License

GPL-3.0-or-later. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
