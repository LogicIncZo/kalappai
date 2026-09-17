# kalappai — agent operating manual

Tamil-first typing tutor. A static PWA: no server, no accounts, no telemetry, works
offline. The certification service lives in a **separate repo**
([`LogicIncZo/kalappai-cert`](https://github.com/LogicIncZo/kalappai-cert)) and is optional —
this repo must stay fully functional when that service is unreachable.

**This file is the contract between the repo and whoever (or whatever) is changing it.**
Read it before your first edit; follow the loop; do not weaken a gate to make a change pass.

## The loop

Each iteration is one unit of work, and ends in a commit that a stranger could verify:

1. **Pick** the top unstarted task from [BACKLOG.md](BACKLOG.md) — or the task you were given.
2. **Read the surface you are about to touch.** Two files are the source of truth:
   - `src/engine.ts` — the layout rule machines, the lesson book (`BOOK` → `LESSONS`), and the
     progress store. Single file by design: inspectable, diffable, verifiable.
   - `test/golden.ts` — the golden keystroke corpus. This is the behavioural spec: a keystroke
     sequence and the Tamil it must produce, per layout.
   Change behaviour without changing the corpus and the gate fails — deliberately.
3. **Change code and tests together.** A layout change needs a golden case; a lesson change
   needs the self-check to still cover it.
4. **Run the gate**: `bun run verify`. Nine stages, no skipping. It must exit 0.
5. **Commit** — conventional-commit subject, imperative, explaining *why* when it is not obvious.
   Never commit `dist/` or `node_modules/`.
6. **Deploy** by pushing to `main` (GitHub Pages build + publish is automatic).
7. **Confirm the deployment**: `bun run smoke:live` — it tests the *deployed* site against the
   *committed* build, and the *deployed* certification service against the *pinned* contract.
8. **Record** what changed: tick the task in `BACKLOG.md`, add a `CHANGELOG.md` entry.

If a step cannot be completed, say so in the commit message and in `BACKLOG.md` rather than
leaving the repo in a state where the gate passes but the deployment is untested.

## Verification gates

`bun run verify` → `scripts/verify.sh`. Every stage is a real gate: it fails the build.

| # | Stage | What it protects |
| --- | --- | --- |
| 1 | `contract:check` | The vendored `contract/cert-service.v1.json` still hashes to `contract/PINNED.sha256`, and `src/App.tsx` still speaks the fields it declares. Catches the app drifting from the service. |
| 2 | `check-docs` | README's claims are derived from code, not prose: lesson/chapter/exercise counts, layout names, self-check pair count, golden case count, and the gate command itself. |
| 3 | `typecheck` | `tsc --noEmit` over `src/`, `test/`, `scripts/`, `demo/` — the verification code is code, and must itself be verified. |
| 4 | `lint` | Biome (`--error-on-warnings`). Formatting is deliberately off; this is a bug gate, not a style gate. |
| 5 | `test` | Engine golden corpus + self-check (every lesson item is typeable on its declared layout) + akshara tokenizer. |
| 6 | `build` | `vite build` produces the PWA. |
| 7 | `smoke:dist` | Serves `dist/` and asserts the PWA invariants: manifest fields, service worker present, icons exist at the sizes the manifest claims, base path correct, no dev-only references, and the engine boots with no page errors. |
| 8 | `demo:seed --check` | The demo's seeded progress is replayed through the engine and must resolve to real lessons and reachable items. Keeps demo infrastructure from rotting. |
| 9 | `hygiene` | No secrets, no tracked `dist/`/`node_modules/`, no stray root files, and the gate itself still runs its stages. |

Deployment-side gates (run by CI, and by you after a deploy):

- `bun run smoke:live` — the deployed Pages site serves the current build, and the deployed
  certification service still satisfies the pinned contract.
- CI `conformance` job — same check, against the live URLs, on every push to `main`.
- CI `release` job — on a `v*` tag, publishes a zip of `dist/` with build provenance.

Fast inner loop: `bun run verify --fast` (contract, docs, types, tests — skips lint, PWA smoke, demo).

## Invariants — do not break these

1. **NFC everywhere.** Tamil text is normalised on ingest *and* on input (`nfc()` in `engine.ts`).
   Comparing un-normalised Tamil is how this class of app silently breaks. Never store or
   compare raw combining sequences.
2. **Every layout rule is provable or labelled.** Each layout cites a pinned upstream source in
   [NOTICE.md](NOTICE.md). A rule that cannot be traced to a source must be labelled
   *practice-only* in the UI — do not quietly promote a guess into a taught rule.
3. **The lesson book must stay reachable.** Every item in every lesson must be typeable on the
   layout that lesson declares. `selfCheck()` proves it and the gate asserts the count.
4. **The browser owns the keystroke.** Physical keys are read via `event.code` and resolved by
   the layout's own rule machine. No OS keyboard, no IME dependency, no per-layout code paths
   in the UI.
5. **Offline-first.** Lessons, engine and UI are local. Certification is the only network
   feature and it is opt-in, user-supplied, and never required to use the app.
6. **No accounts, no telemetry, no PII.** Progress lives in `localStorage`. Do not add analytics.
7. **The certification contract is pinned, not assumed.** The app is a client of a service it
   does not control. Change the request/response shape only together with a re-vendored
   contract (`bun run contract:sync`), which updates `PINNED.sha256` in the same commit.
8. **Honest labelling beats a stronger claim.** A Kalappai certificate is a practice record,
   not a TNDTE/TNPSC qualification. That sentence stays wherever one is issued or verified.

## Working on the engine

The engine is deliberately one file with no dependencies, because its correctness is the
product. Rules of thumb:

- A layout is a `Layout` with either a `tamil99`-style rule machine (modifier keys, dead keys,
  context-sensitive rewrites) or `stateless` (shift levels only). Transliteration is a third
  engine kind with ordered rewrite rules and buffer-tail re-editing.
- Add a golden case for every behaviour change **before** changing the behaviour: corpus first,
  then code, then the gate proves the pair.
- If a change makes an existing golden case fail, that is information — decide deliberately
  whether the corpus or the code is wrong, and say which in the commit message.

## Demo infrastructure

`demo/` exists so a release can be shown without hand-typing an exam each time, and so
screenshots stay reproducible:

- `bun run demo:seed` — writes `demo/out/progress.json` (a deterministic progress map) and
  prints the lesson state it implies. `--check` (gate mode) replays it through the engine.
- `bun run demo:walkthrough` — drives the built app in a real browser (agent-browser), stepping
  book → lesson → typing → exam → certificate and capturing screenshots to `demo/out/`.
  Requires a browser; not part of the default gate. Enable it in a full run with
  `bun run verify --full`.

## Layout

| Path | What lives there |
| --- | --- |
| `src/engine.ts` | **The declared behaviour.** Layouts, rule machines, lesson book, metrics, progress, `selfCheck` |
| `src/App.tsx` | The single-page UI: book view, practice view, exam mode, keyboard visualiser, certification panel |
| `src/theme.css` | Tailwind entry + Tamil font stack |
| `test/engine.test.ts` | Golden replay, self-check assertion, tokenizer |
| `test/golden.ts` | **The behavioural spec.** Golden keystroke corpus per layout |
| `contract/` | Vendored service contract + SHA-256 pin (do not edit by hand) |
| `scripts/verify.sh` | The gate. `check-contract.ts`, `check-docs.ts`, `smoke-dist.ts`, `smoke-live.ts`, `sync-contract.sh` |
| `demo/` | Seeded progress + browser walkthrough + screenshots |
| `docs/` | `REQUIREMENTS.md`, `SPECIFICATIONS.md`, `PRODUCT.md` (design intent + product strategy), `ref/` (pinned upstream layout sources) |
| `public/` | Icons, favicon, PWA assets |

## Deployment

GitHub Pages: **<https://logicinczo.github.io/kalappai/>** — built and published by
`.github/workflows/ci.yml` on every push to `main`, base path `/kalappai/`.

Local preview of the real build: `bun run build && bun run preview`.

`KALAPPAI_BASE` overrides the base path at build time (default `/kalappai/`), for hosts that
serve the app from the domain root.
