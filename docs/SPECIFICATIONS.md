# Kalappai (கலப்பை) — Technical Specification

**Status:** draft for review · 2026-09-13
**Companion:** `file REQUIREMENTS.md` (FR IDs referenced throughout)
**Target:** v1.2 milestone set M0–M6

This document specifies *how* Kalappai is built. `file REQUIREMENTS.md` specifies
*what* and *why*. Where this document makes an unverifiable claim about an
external system (an exam rule, a layout mapping, a licence), it is marked
`[unverified]` and must carry a source in `file data/provenance.yaml` before ship.

---

## 0. Design invariants

Five constraints shape every decision below. Violating one is a bug, not a
trade-off.

1. **Static. No server in the learning path.** Core app is a static bundle.
   Progress lives in the browser. Cloud features are opt-in and additive.
2. **The layout is data.** No layout logic in components. Every key mapping
   and composition rule is a versioned data file compiled to a runtime IR.
3. **Akshara is the unit of truth.** Keystrokes, correctness, errors, and
   progress are all measured in Tamil orthographic syllables, not codepoints
   or characters.
4. **Layout-agnostic core.** Tamil99, InScript, and Typewriter are three IRs
   fed the same engine. Adding Malayalam InScript must not require engine work.
5. **Nothing about the learner leaves the device** unless the learner exports it.

---

## 1. Architecture

```markdown
┌──────────────────────────────────────────────────────────────────┐
│  UI shell (React, static)                                        │
│  Learn · Drill · Exam · Layout reference · Progress · Embed      │
└────────────┬─────────────────────────────────────────────────────┘
             │
┌────────────▼─────────────┐   ┌──────────────────────────────────┐
│  Session engine          │   │  Layout runtime                  │
│  · passage renderer      │◄──┤  · IR loader (lazy, per layout)  │
│  · keystroke capture     │   │  · rule machine (FSM + context)  │
│  · timer / exam clock    │   │  · predicted-output oracle       │
└────────────┬─────────────┘   └──────────────────────────────────┘
             │
┌────────────▼─────────────┐   ┌──────────────────────────────────┐
│  Akshara analyser        │   │  Data plane (versioned JSON)     │
│  · normaliser (NFC)      │◄──┤  · layouts/*.json  (IR)          │
│  · tokeniser             │   │  · passages/*.json               │
│  · diff + error taxonomy │   │  · exam-profiles/*.yaml          │
│  · scorer (WPM + KPM)    │   │  · lexicon/ , provenance.yaml    │
└────────────┬─────────────┘   └──────────────────────────────────┘
             │
┌────────────▼─────────────┐
│  Persistence             │
│  IndexedDB (sessions)    │
│  JSON export/import      │
│  optional: user-owned    │
│  sync endpoint (v2)      │
└──────────────────────────┘
```

### 1.1 Module boundaries

| Module | Responsibility | Must not |
| --- | --- | --- |
| `layout-runtime` | Key event → intended Tamil output | Know about lessons, scoring, or UI |
| `akshara` | Normalise, tokenise, diff | Know about layouts |
| `scorer` | WPM/KPM, accuracy, streaks | Render anything |
| `session` | Orchestrate the three above + clock | Contain layout conditionals |
| `persistence` | Read/write progress | Block on network |

The `layout-runtime` ↔ `session` seam is the most important API in the
codebase. It is defined once (§4.3) and consumed identically by the app, the
embed widget, and the golden-corpus test harness.

---

## 2. Repository layout

```markdown
kalappai/
├── apps/
│   └── web/                     # the static app
├── packages/
│   ├── layout-runtime/          # IR loader + rule machine
│   ├── layout-compiler/         # .kmn/.xkb → IR  (build-time, Node)
│   ├── akshara/                 # normalise, tokenise, diff
│   ├── scorer/
│   └── session/
├── layouts/
│   ├── tamil99/                 # source + IR + tests
│   ├── inscript-tamil/
│   └── typewriter-tamil/
├── passages/
│   ├── graded/                  # L1..L8, our text (CC0/CC-BY)
│   ├── exam/                    # profile-shaped passages
│   └── corpus/                  # reference text, licence-cleared
├── exam-profiles/
├── tools/
│   ├── kmn2ir/                  # Keyman source → IR
│   ├── xkb2ir/                  # X11 symbols → IR
│   └── replay/                  # golden corpus runner
├── embeddings/                  # <div data-iframe-wrapper="true"><div data-iframe-wrapper="true"><div data-iframe-wrapper="true"><div data-iframe-wrapper="true"><iframe> embed target
├── data/provenance.yaml
└── docs/
```

Rationale: `packages/layout-compiler` runs only at build time and is the only
place that depends on Node. Everything the learner executes is browser-only.

---

## 3. Layout IR

### 3.1 Why an IR

The three target layouts have genuinely different mechanics:

| Layout | Mechanism | Composition |
| --- | --- | --- |
| **Tamil99** | Input-method style; most keys emit a bare consonant, modifiers shift between pure/akara forms, `^` is a vowel-sign dead key | Stateful, context-sensitive |
| **InScript (Tamil)** | Static 2-level map per IS 16350 / IS 13194 family `[unverified]` | Stateless |
| **Typewriter (Bamini lineage)** | Legacy key order; vowels as first-class keys; different composition order | Mostly stateless, some contextual override |

Encoding them as three hand-written engines would triple the surface area and
make the comparison feature (FR-6.2) impossible. One IR, one engine.

### 3.2 Schema

```jsonc
{
  "id": "tamil99",
  "name": "த99-விரிவு | ta99 Extended",
  "script": "Tamil",
  "revision": "2.2.1-kalappai.1",
  "source": {
    "kind": "keyman",
    "project": "keymanapp/keyboards",
    "path": "release/t/thamizha_tamil99_ext",
    "upstreamVersion": "2.2.1",
    "licence": "MIT",
    "copyright": "© 2008-2025 thamizha.com and SIL Global",
    "retrieved": "2026-09-13"
  },

  // Stateless key → output. Order matters only for documentation.
  "map": {
    "default": { "a": "அ", "b": "ஆ", ... },
    "shift":   { "A": "ஔ", ... },
    "altgr":   { ... }
  },

  // Which keys arm a composition state. `dead`: the key emits nothing
  // until a following key resolves it.
  "states": {
    "vowelsign": { "armedBy": ["^"], "dead": true, "abortOn": ["Escape"] }
  },

  // Ordered context rules. Evaluated longest-context-first, first match wins.
  // `ctx` pattern is a regex over the last N codepoints of the buffer.
  // `out` may reference captures.
  "rules": [
    {
      "id": "t99.pulli",
      "state": "default",
      "ctx": "^(?<base>[\\u0B95-\\u0BB9])$",
      "key": "f",
      "out": "{base}\u0BCD",
      "note": "அகர-மெய் + f → pure consonant (FR-1.5)"
    },
    {
      "id": "t99.vsign-aa",
      "state": "vowelsign",
      "key": "q",
      "out": "\u0BBE",
      "next": "default"
    }
  ],

  // Keys that must not produce text (FR-1.5 terminal key roster).
  "passthrough": ["Tab", "Escape", "F1"],

  // Declared reachability, asserted by tests (§9.3).
  "coverage": {
    "vowels":   ["\u0B85", "\u0B86", "\u0B87", ...],
    "consonants": ["\u0B95", ...],
    "signs": ["\u0BBE", "\u0BBF", "\u0BC0", ...],
    "symbols": ["\u0BF9", "\u0BD0", "\u0BF3" ],
    "marks": ["\u0BCD", "\u0BD7"]
  },

  // Known divergences from the reference implementation, with reason.
  "divergences": []
}
```

### 3.3 Rule engine semantics

State machine: `(state, modifierMask)` → `(output, nextState)`.

Evaluation order for a keystroke `k` under state `s`:

1. If `k` is in `passthrough` → emit nothing, bubble raw event.
2. Collect rules where `state == s` and `key == k`.
3. Among those, filter to rules whose `ctx` matches the current buffer tail.
4. Sort by context length descending, then by `id` for determinism.
5. First rule wins. Emit `out`, transition to `next` (default `s`).
6. If no rule matched and `s` is `dead` → emit the dead key's literal (or
   nothing, per `abortPolicy`), return to `default`.
7. If no rule matched in `default` → literal passthrough of the platform
   character (so digits, punctuation, and Latin still work).

Determinism is required: the golden corpus (§9.2) asserts exact output
sequences, so rule ordering must never depend on object key order.

### 3.4 Compiler: Keyman → IR

`tools/kmn2ir` parses `.kmn` source and emits IR. It must handle the subset
Keyman actually uses in these keyboards:

| Keyman construct | IR mapping |
| --- | --- |
| `store(name) "abc"` | Inlined as a lookup table |
| `store(name) U+0Bxx U+0Byy ...` | Index-aligned table |
| `+ "x" > "out"` | `map` entry, or `rules` entry if contextful |
| `any(store) + "f" >` | `rules` with `ctx` regex derived from the store |
| `index(store, N)` | Capture reference in `out` |
| `dk(0)` / `deadkey` | `states` entry with `dead: true` |
| `context` | Buffer-tail match |
| `nul` | Rule producing empty output |
| `outs(...)` | Named output macro, expanded at compile |

Compilation is **not** trusted. The IR is only accepted once it replays the
golden corpus byte-identically (§9.2). If the compiler cannot express a rule,
it must fail the build loudly rather than drop it — a silently dropped rule
is a wrong teacher.

For the X11 route (`xkb2ir`), the `in` symbols file provides `tam` (InScript)
and `tam_tamilnet` variants as `key <code> { [ base, shift ] }` — a direct
read into `map`. No rule machinery needed.

### 3.5 Layout versions

`file layouts/<id>/IR.json` is generated and committed. Regeneration is a scripted,
diffable step so a layout change is reviewable as a diff, never silent.
`revision` encodes `upstreamVersion-kalappai.N` so a learner's saved session
records which layout revision they typed under (needed to interpret old error
data correctly).

---

## 4. Input capture

### 4.1 The browser-as-keyboard decision

Today a Tamil learner must install a system keyboard before they can practice
at all — an OS-level, admin-rights, reboot-sometimes step that is the single
largest drop-off in the funnel. Kalappai inverts it: the inbox is a
`contenteditable`-free custom buffer, and `keydown` is intercepted and mapped
through the IR. No OS install, works on a locked-down exam-hall PC or a
college lab machine.

Consequence: we own the caret, the buffer, and the composition. That is more
work than a naive `<input>`, and it is the product.

### 4.2 Key handling rules

- `keydown` is the source of truth; use `event.code` (physical key) not
  `event.key` (layout-dependent). Physical position is what a typing exam tests.
- `preventDefault()` on every mapped key, so the browser's own IME/keyboard
  never double-inserts.
- Track modifier state from `getModifierState()`; do not infer Shift from
  whether `key` is uppercase.
- Ignore auto-repeat for scoring but allow it in the buffer (a held key is a
  real keystroke for the learner, but must not inflate KPM).
- Dead keys render as a pending-state indicator in the layout reference, and
  a subtle caret state in the drill view.

### 4.3 The seam

```ts
interface LayoutRuntime {
  id: string;
  revision: string;

  /** Resolve one physical keystroke. Pure — no side effects. */
  resolve(input: {
    code: string;              // KeyboardEvent.code
    shift: boolean;
    altGr: boolean;
    buffer: string;            // current composed text
    state: string;
  }): {
    output: string;            // text to insert ("" for consumed/dead)
    nextState: string;
    consumed: boolean;         // false → bubble to app
    ruleId: string | null;     // for the "why did that happen" explainer
  };

  /** For hints and the layout reference: what does this key do, now? */
  describe(state: string, code: string, shift: boolean): KeyHint | null;

  /** Full reachable-output set, for coverage tests and cheat sheets. */
  outputs(): Set<string>;
}
```

`resolve` being pure is what makes the replay harness (§9.2) trivial and what
makes the hint system (FR-7.2) possible without duplicating layout logic.

The `ruleId` on every resolution is also how FR-6.4 works: a learner can
report "this looks wrong" and we already have the rule that produced it.

---

## 5. Akshara model

### 5.1 Normalisation

Two text streams meet in this app: the *expected* passage and the *produced*
text. Both must be normalised identically before comparison, or we generate
phantom errors.

- NFC on ingest (passage loading, import) and on every produced string.
- Tamil specifics that actually matter:
  - `ஔ` (U+0B94) has a canonical decomposition; NFC recomposes it. Both
    streams must pass through NFC or this is a guaranteed false error.
  - Precomposed `ஜ` (U+0B9C) vs a decomposed sequence `[unverified]` — assert
    in tests rather than assume.
  - ZWNJ/ZWJ are **preserved**, never stripped: they carry meaning (e.g.
    blocking a `க்ஷ`-style conjunct; FR-1.6). Stripping them would merge two
    legitimately distinct renderings.
- A `normalisationReport()` diagnostic prints any codepoint in a passage that
  is not NFC, not in the Tamil block, or outside the declared coverage. Run in
  CI over every passage file.

### 5.2 Tokeniser

An akshara = consonant cluster (with optional pulli-joined members) + optional
vowel sign + optional suffix marks.

```markdown
akshara := cluster (vowelsign | ) (mark)*
cluster := consonant (pulli consonant)*
```

We do **not** rely on `Intl.Segmenter` as the authority. Modern engines handle
Tamil grapheme clusters inconsistently around pulli sequences and ZWNJ, and
segmenter output varies by engine version — unacceptable for a scoring engine
that must be reproducible. Instead:

1. Implement the tokeniser directly over the Tamil block (U+0B80–U+0BFF).
2. In tests, compare against `Intl.Segmenter('ta', {granularity:'grapheme'})`
   and record every disagreement in a fixture. Disagreements are documented,
   not averaged away.

### 5.3 Diff and error taxonomy

Token-level alignment via weighted edit script over akshara tokens
(Needleman–Wunsch with a small opened/closed gap model), not character diff.
Fractions of an akshara are not a thing a learner can fix.

| Code | Error | Detected by |
| --- | --- | --- |
| `SUB` | Wrong akshara | Substitution in alignment |
| `CASE-MEI` | Used the akara-mei form instead of the pure form (or vice versa) | Output differs only by presence of U+0BCD |
| `VSIGN` | Right consonant, wrong vowel sign | Same cluster, different sign |
| `LIG` | Conjunct formed that shouldn't be, or missed (ZWNJ) | Differs only by ZWNJ/ZWJ |
| `NORM` | Canonically equivalent but not NFC | Equal after NFC, unequal before |
| `SWAP` | Adjacent transposition | Two-token swap in alignment |
| `OMIT` / `INS` | Skipped / inserted an akshara | Gap in alignment |
| `LAYOUT` | Output matches *another* loaded layout's output for the same key plus neighbouring context | Cross-layout lookup |

`LAYOUT` is the pedagogically important one and the reason the cross-layout
comparison feature exists at all. A learner who types Tamil99 mappings while
in InScript mode produces a characteristic error signature; we can name it
instead of just marking it wrong.

`NORM` must never be counted as a learner error. If it fires, that is our bug.

---

## 6. Scoring

### 6.1 Two rates, one truth

| Rate | Definition | Used for |
| --- | --- | --- |
| **WPM (gross)** | `(keystrokes / 5) / minutes` | Exam authenticity |
| **WPM (net)** | `((keystrokes − penalties) / 5) / minutes` | Exam authenticity, certification-style |
| **KPM** | aksharas per minute | Learning feedback, progress |

Tamil has a much lower information density per keystroke than English — a
single akshara can be four or five keystrokes. Reporting only WPM makes Tamil
learners look artificially slow and demotivates them. KPM is the honest
learning metric; WPM is the exam metric. The UI shows the profile-authoritative
one prominently and the other on demand.

Exact WPM formula, keystroke counting convention, and penalty schedule are
**per exam profile** (§7), because they differ between examining bodies and
must not be hardcoded.

### 6.2 Accuracy

`accuracy = correctAksharas / (correctAksharas + errorAksharas)`, where
`NORM`-class events are excluded. Reported with the error breakdown, never as
a bare percentage.

---

## 7. Exam profiles

Profiles are versioned data (`file exam-profiles/*.yaml`), never code.

```yaml
id: tndte-junior-tamil
body: TNDTE
name: Tamil Typewriting — Junior Grade
verified: false
sources: []            # required before verified can flip to true
durationMinutes: null
passageWords: null
wordConvention: five-keystroke   # vs akshara-count
speedThresholdWpm: null
errorPenalty: null
minAccuracy: null
layout: tamil99
notes: >
  Public descriptions of the junior/senior grade structure are not
  consistent enough to encode without a primary source. All values
  null until sourced.
```

Rules:

- Every quantity is `null` until sourced from a primary document. A profile
  with nulls is *usable* (practice mode) but never presented as
  exam-authentic.
- `verified: true` requires a non-empty `sources`.
- The exam UI must display the profile's verification state to the learner.
  Presenting an unsourced profile as authoritative is the failure mode this
  project exists to avoid.

---

## 8. Lesson and drill engine

### 8.1 Content model

```yaml
# passages/graded/ta-L3-common-signs.yaml
id: ta-L3-common-signs
level: 3
script: Tamil
licence: CC0-1.0
objective: Vowel signs and pulli on the most frequent consonants
aksharaFocus: ["\u0BBE", "\u0BC6", "\u0BCD"]
textUnicode: |
  ...
```

Graded ladder: L1 single akshara → L2 clusters → L3 vowel signs + pulli →
L4 high-frequency words → L5 sentences → L6 paragraph → L7 exam-shaped →
L8 domain (government forms, RTI wording, financial terms).

L8 is where CashlessConsumer domain text enters: form field labels, RTI
boilerplate, banking terminology. That is a genuinely unserved need and costs
us nothing but text.

### 8.2 Adaptive drilling

Per-learner akshara confusion matrix `M[expected][typed]`, persisted locally.
Drill generation samples inversely proportional to `M` diagonal, with a floor
so mastered aksharas still resurface. Deterministic given a seed, so a
session is reproducible and testable.

### 8.3 "Why did that happen?"

On an error, the session engine can ask the layout runtime for the `ruleId`
that fired and render the rule's `note` in plain Tamil and English. This is
the feature that makes a layout learnable instead of memorisable — it is
cheap to build *because* the IR carries rule identity and prose notes, and
almost impossible to bolt on to a hand-written layout engine later.

---

## 9. Testing

### 9.1 Layers

| Layer | What it proves | Tool |
| --- | --- | --- |
| Unit | Tokeniser, normaliser, diff, scorer | Vitest |
| Golden corpus | IR matches reference implementation exactly | Custom replay harness |
| Property | Score monotonicity, diff symmetry, NFC idempotence | fast-check |
| Fixture | Cross-engine segmentation disagreements | Committed fixtures |
| A11y | WCAG 2.2 AA | axe + manual screen-reader pass |
| Perf | First input on low-end Android | Lighthouse CI budget |

### 9.2 Golden corpus (the M0 gate)

For each layout, a committed corpus of `{keystroke sequence → expected string}`
derived from the reference implementation. The harness replays every sequence
through the IR and asserts byte-identical output.

Sources of truth:

- **Tamil99 / Typewriter** — Keyman `.kmn` compiled by the Keyman compiler,
  driven headlessly. `[unverified]` until the harness actually runs it; if
  headless compilation proves impractical, fall back to a manually captured
  corpus and mark the corpus provenance accordingly.
- **InScript** — `xkb` definitions as the reference; plus a hand-audited
  sample against the BIS standard `[unverified]`.
- **Cross-validation** — `wikimedia/jquery.ime` rules (`ta-99`, `ta-inscript`,
  `ta-inscript2`, `ta-bamini`) and its committed Tamil fixtures compile to a
  second, independent set of test vectors. Its `ta-99` core rules were read
  and agree with the Keyman thamizha source (auto-pulli, geminate `க்கh → க்கக`, grantha conjunct/ZWNJ pair). Peripheral divergences exist and are
  ledger material, not blockers: decorative shift keys (`G`→⚪, `H`→⚫,
  `J`→★), `N`→ௐ, `L`→௱, Tamil digits via a `\0`–`\9` pattern path, and no
  `^` dead-key machinery.

**Note on jquery.ime reuse (decided 2026-09-13).** Its *data* is reused as
reference and test vectors; its *engine* is not. Grounds: (a) it captures
`keypress` and reconstructs the key with `String.fromCharCode(e.which)` — a
logical-character model that is blind to physical key position, which is
exactly what a typing exam trains and what our §4.2 requires;
(b) hard jQuery dependency against a React app with a 200 KB budget;
(c) it mutates a live editable-DOM buffer and owns the caret, while FR-1.5
needs our own buffer plus per-keystroke rule attribution — retrofitting
`ruleId` provenance means forking the engine anyway. The convergent design
(ordered patterns, context regex, `maxKeyLength`) is independent validation
of the hand-rolled FSM leaning in D1. Conversion of its pattern arrays into
IR test vectors is mechanical and lives in `tools/` alongside `kmn2ir`.

A layout does not ship with `M0` unpassed. No exceptions, no "known-broken"
allowlist that silently grows.

### 9.3 Coverage assertions

`outputs()` must equal the declared `coverage` set exactly. This catches the
realistic failure mode where a compiler drops a rule and the layout quietly
becomes unable to type, say, `ஸ்ரீ`, which nobody notices until an exam.

---

## 10. Persistence and offline

- **PWA**, fully offline after first load. Installable, which matters on the
  cheap Android phones this audience actually uses.
- **IndexedDB** for sessions, per-learner confusion matrix, settings.
- **Export**: a plain JSON file, human-readable, importable. FR-7.3's
  guarantee made concrete — a learner's progress must survive us.
- **No accounts at v1.** Optional user-owned sync (a learner points us at
  their own endpoint, or a file they keep in their own cloud) at v2.
- Storage budget: first-load JS under 200 KB gzipped excluding fonts; Tamil
  font subset loaded on demand, not blocking first input.

---

## 11. Accessibility

- Keyboard-navigable end to end, including the typing surface itself (it is
  the primary input, so it must be reachable and announced).
- Live region announces akshara completion, not every keystroke.
- Full contrast pass; the caret and pending-deadkey indicators must not rely
  on subtle colour shifts.
- Screen-reader path: reading the passage and reporting errors positionally.
  A typing tutor is inherently visual, so this is a real design problem, not a
  checklist item; it gets its own milestone (M6) and its own review.
- Bilingual UI (Tamil/English) with Tamil default; all layout notes in both.

---

## 12. Embed interface

Institutes and exam-coaching centres must be able to drop Kalappai into their
own page. This is an adoption lever, not a nice-to-have.

```html
<iframe src="https://…/embed?layout=tamil99&mode=drill&level=3"
        width="100%" height="420" title="Tamil typing practice"></iframe>
```

- `postMessage` protocol for `ready`, `progress`, `complete`.
- The embed is the same static bundle; no separate build.
- No learner data crosses the frame boundary except what the host explicitly
  subscribes to.

---

## 13. Provenance and licensing

Every externally-derived artefact is recorded in `file data/provenance.yaml` and
rendered in-app.

| Asset | Upstream | Licence | Verified |
| --- | --- | --- | --- |
| Tamil99 layout logic | `keymanapp/keyboards` → `thamizha_tamil99_ext` | MIT ("© 2008-2025 thamizha.com and SIL Global") | ✅ read from upstream `file LICENSE.md` |
| New Typewriter layout logic | `thamizha_new_typewriter` | MIT (same header) | ✅ |
| Bamini / Anjal Paangu | `thamizha_bamini`, `thamizha_anjal_paangu` | MIT (same header) | ✅ |
| InScript (Tamil) mappings | `xkb-data` `symbols/in` → `tam` | X11/MIT-family, multi-holder copyright header | ⚠️ read, needs exact clause citation |
| TamilNet99 mappings | `xkb-data` `symbols/in` → `tam_tamilnet` | same file header | ⚠️ same |
| Cross-validation corpus + Tamil fixtures | `wikimedia/jquery.ime` v0.2.0 — `ta-99`, `ta-inscript`, `ta-inscript2`, `ta-bamini` rules; `file test/jquery.ime.test.fixtures.js` | repo dual-licence GPL-2.0-or-later **OR MIT**; rules files self-declare GPLv3 in their metadata | ✅ read 2026-09-13; consumed as test vectors and reference only — nothing vendored into runtime |
| Exam rules | examining bodies | n/a (facts, but must cite) | ❌ all null pending primary sources |
| Passages (graded) | original | CC0-1.0 | ✅ |
| Passages (corpus) | varies | per-file, must be cleared | ❌ |

Two obligations that are easy to get wrong and therefore are test-enforced:

1. **MIT requires the copyright notice travel with the code.** Our bundle must
   ship the upstream notices. A CI check asserts the notice file is present.
2. **Version pinning.** Every layout IR records the upstream version it came
   from. A layout bug report is unresolvable without it.

Note on the Keyman route: keymanapp's own repository is MIT, and the four
thamizha keyboards we depend on are individually MIT. That combination is what
makes the "reuse the reference implementation" strategy legitimate rather than
a reimplementation exercise.

---

## 14. Milestones → workstreams

| M | Deliverable | Workstreams | Hard gate |
| --- | --- | --- | --- |
| **M0** | Repo, layout IR, Tamil99 compiled and golden-tested | §2, §3, §9.2 | Replay corpus byte-identical for every rule |
| **M1** | Typing surface + akshara engine | §4, §5 | NFC idempotence; tokeniser fixtures committed |
| **M2** | Learn mode: L1–L4, hints, "why" explainer | §8.1, §8.3, FR-7.2 | Hint correctness on 100% of coverage set |
| **M3** | Drill mode + adaptive confusion matrix | §8.2, §6 | Deterministic given seed |
| **M4** | Exam mode + sourced profiles | §7 | No profile ships `verified:true` without sources |
| **M5** | InScript + Typewriter IRs; cross-layout comparison | §3.4, §5.3 | Golden corpus passes for all three |
| **M6** | A11y audit, bilingual completeness, launch | §10, §11, §12 | WCAG 2.2 AA; offline verified on low-end hardware |

Sequencing note: M4 depends on external documents we do not control. Do not
let profile sourcing block M1–M3 — build the engine against unsourced profiles
with nulls, ship practice mode, and let exam mode land when the sources do.

---

## 15. Open decisions

| \# | Decision | Options | Leaning |
| --- | --- | --- | --- |
| D1 | Rule-engine implementation | Hand-rolled FSM vs existing Keyman WASM engine | Hand-rolled. The IR must be inspectable and diffable; a black-box engine defeats "the layout is data" and the `ruleId` explainer. |
| D2 | Golden corpus source | Headless Keyman compile vs captured corpus | Headless if it runs in CI without a GUI; otherwise captured + provenance-marked. Decide at M0, not before. |
| D3 | Framework | React vs Preact vs vanilla | React for contributor familiarity; revisit if the 200 KB budget (§10) fails. |
| D4 | Font | Noto Sans Tamil vs InaiMathi-parity vs user's system font | Ship a subset; never depend on a system font being installed. |
| D5 | Transcription in passages | Unicode only | Unicode only. Never TSCII/TAB/TACE-16 in the pipeline. |
| D6 | Telemetry | None vs opt-in aggregate | None at v1. Aggregate error-pattern sharing is a v2 conversation and must be opt-in and learner-readable. |

---

## 16. What is deliberately not in this spec

No accounts, no cloud sync, no leaderboards, no ads, no monetisation of
learner data (FR: out of scope). No voice or stenography transcription. No
languages beyond Tamil at v1 — but the IR is script-tagged and the akshara
tokeniser takes a script profile, so Malayalam/Kannada/Telugu InScript are a
data addition, not an engine rewrite. That is the whole point of the
architecture, and it is worth stating explicitly because it is the reason to
pay the upfront cost of an IR.