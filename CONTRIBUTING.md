# Contributing

This repository is set up to be developed by a **loop**: an agent or a person picks
one item from [`BACKLOG.md`](BACKLOG.md), makes the smallest honest change, runs the
gate, and commits. The gate — `bun run verify` — is the contract between a change
and a commit. Everything else here follows from that.

Read [`AGENTS.md`](AGENTS.md) first: it is the operating manual, and it names the
invariants this project actually cares about (NFC-normalised Tamil, every layout
rule traceable to a pinned source, honest labelling, no accounts or telemetry).

## The loop

```sh
bun install
bun run verify --fast     # tight inner loop: contract, docs, types, tests
bun run verify            # the real gate, before you commit
bun run verify --full     # the gate plus the browser walkthrough
```

Then commit, push to `main`, and **confirm the deployment**:

```sh
bun run smoke:live        # the deployed site and service, against this commit
```

A change is not finished when the gate passes locally. It is finished when the
deployed surface is shown to match it — or when the commit message says plainly
that the deployment was not verified.

## What each gate protects

`bun run verify` runs nine stages. They exist because each one has caught something
a human reviewer did not:

| Stage | The failure it catches |
| --- | --- |
| `contract:check` | The app drifting from the certification service's declared surface |
| `check-docs` | A README that has quietly stopped being true |
| `typecheck` | Including the verification scripts — the gate is code too |
| `lint` | Real bugs (unused variables, unsafe patterns), not formatting |
| `test` | A behaviour change that does not match the golden keystroke corpus |
| `build` | A PWA that does not build |
| `smoke:dist` | A manifest, icon, base path or service worker that does not actually work |
| `demo:seed` | Demo infrastructure that has rotted away from the book |
| `hygiene` | A committed secret, build output, or a gate edited into a no-op |

## Changing a layout or a lesson

The engine is one file with no dependencies because its correctness *is* the
product. The corpus is the specification:

1. Add the golden case to [`test/golden.ts`](test/golden.ts) **first** — a keystroke
   sequence and the Tamil it must produce.
2. Change `src/engine.ts`.
3. Run the gate. If an existing case now fails, that is information: decide
   deliberately whether the corpus or the code is wrong, and say which in the
   commit message.

A new or changed layout rule must cite a pinned upstream source in
[`NOTICE.md`](NOTICE.md). A rule that cannot be traced to one must be labelled
*practice-only* in the UI — do not quietly promote a guess into a taught rule.

## Changing the contract

The certification service is a separate repository and a separate deployment. This
repo is a **client** of a service it does not control, so the request and response
shape is vendored and pinned:

```sh
bun scripts/sync-contract.sh          # re-vendor from the service repo
bun scripts/sync-contract.sh --check  # is the pin current?
```

Changing the shape is a two-repo change, in this order:

1. Land the change in `LogicIncZo/kalappai-cert`, including its own
   `contract:emit` and gate.
2. Re-vendor here (`bun scripts/sync-contract.sh`) — this updates
   `contract/PINNED.sha256` in the same commit as the code that depends on it.
3. Only then change `src/App.tsx`.

Never hand-edit `contract/cert-service.v1.json`. The pin is what stops the two
repos drifting silently, and it only works if nothing writes to it by hand.

## House style

- **Comments explain why, not what.** The interesting information is the constraint
  that made the code look this way.
- **Honest labelling beats a stronger claim.** If a mechanism is a cost barrier
  rather than a proof, the docs say so.
- **Commit subjects** are conventional, imperative, and explain *why* when it is
  not obvious from the diff.
- **No new runtime dependency** without a reason that survives review: this app is
  offline-first, and every dependency is a thing that must work on a low-end phone
  in airplane mode.
