# Changelog

Notable changes to the Kalappai typing tutor. The certification contract is pinned,
not versioned here — when it moves, `contract/PINNED.sha256` moves with it.

## [Unreleased]

### Added

- **Verification gate** (`bun run verify`, 9 stages): vendored-contract pin, docs,
  typecheck, lint, tests, build, PWA smoke, demo seed, hygiene. Every stage is a
  real gate — it fails the build.
- **Deployed-surface conformance** (`bun run smoke:live`): compares the deployed
  Pages build against the committed build, and the deployed certification service
  against the pinned contract. Answers "is production actually running this
  commit?" as a command rather than an assumption.
- **Browser walkthrough** (`bun run demo:walkthrough`): drives the built app
  through book → lesson → typing → exam → practice record → certification panel,
  capturing screenshots to `demo/out/`. Keystrokes are computed by the engine's own
  hint function, so the harness cannot drift from the layouts; the exam leg is
  paced at a human rate so the captured record is a plausible one rather than a
  machine-speed artefact.
- **Demo seed** (`bun run demo:seed [--check]`): a deterministic learner state
  written to `demo/out/progress.json`, derived from the book rather than
  hand-written, and replayed through the engine in gate mode.
- **CI/CD**: the gate on every push and PR; Pages deploy after the gate; deployed
  conformance against the live site and service on `main`; a
  provenance-attested build zip attached on `v*` tags.
- **Loop documentation**: [`AGENTS.md`](AGENTS.md) (the contract between the repo
  and whoever changes it), [`BACKLOG.md`](BACKLOG.md), this file, and
  [`CONTRIBUTING.md`](CONTRIBUTING.md).

### Changed

- **The exam passage is declared in the engine.** `EXAM_TEXT` / `EXAM_SECONDS`
  moved from `src/App.tsx` to `src/engine.ts`: it is content, not presentation,
  and the demo harness and the certification request both need the same one
  string. One declaration, one hash.
- **`AksharaText` exposes a `data-kalappai-target` hook** on its root, plus the
  stage panel carrying the akshara counter, so the walkthrough can assert what the
  app is *actually showing* instead of trusting a copy of the passage.

### Fixed

- **The certification backend was extracted** to
  [`LogicIncZo/kalappai-cert`](https://github.com/LogicIncZo/kalappai-cert). This
  repo is PWA-only again: no server, no `server/` directory, and it stays fully
  functional when the service is unreachable or unconfigured.
- **The contract gate matched a quoted literal** the code no longer contained once
  the URL was built with a template. It now asserts the declared path as a suffix,
  which is what the client actually concatenates onto a user-supplied base — the
  gate still fails if the path changes.
- **The gate miscounted its own stages** (reported 8 while running 9). It now
  reports what it ran.
