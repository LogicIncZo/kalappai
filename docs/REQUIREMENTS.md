# Kalappai (கலப்பை) — Requirements

**An open-source, Tamil-first, browser-based typing tutor for Tamil99, InScript and Tamil Typewriter.**

Status: draft for review · 2026-09-13 · Owner: CashlessConsumer / ThamizhKanimai desk
Companion: `SPEC.md` (how it will be built), `../2026-09-12-indic-typing-tutor-landscape.md` (market scan)

Working codename **Kalappai** (கலப்பை, "plough" — homage to *e-Kalappai*, the 1999-era Tamil99 keyman keyboard). Alternates: *Thaṭṭezhuthi* (தட்டெழுதி), *Ezhuthu*.

---

## 1. Purpose and thesis

Tamil typing education runs on a 1990s model: a physical typewriter classroom, a legacy-font keyboard, and a certificate issued by the Directorate of Technical Education. The web tools that exist are *test simulators* — they measure you, they don't teach you, and they assume you already have the layout installed on your operating system.

Three facts create the opening:

1. **Layouts are official, but learning material isn't.** Tamil99 is notified by the Government of Tamil Nadu; InScript is a BIS standard (IS 13194:1991, with Enhanced InScript in IS 16350:2016). The normative mappings are public. Nobody has turned them into an open, testable, machine-readable teaching corpus.
2. **The exam is a credential gate, not an exam.** TNPSC does not run its own typing test — it requires a *Government Technical Examination in Typewriting* certificate (Higher/Senior Grade in Tamil and English, or a Lower/Junior combination) obtained through DOTE/TNDTE. Millions of aspirants therefore train against an exam whose rules, speeds and marking they mostly learn second-hand.
3. **A browser can now be the keyboard.** A web app can own the keystroke, run the layout's own rule machine, and render Tamil output without the learner installing anything. That makes *teaching the layout itself* — not just measuring speed — possible on any machine, including a borrowed one.

**Thesis:** the defensible product is a **layout-aware tutor with an honest scoring engine**, not another typing test. Speed is the outcome; key discipline and error attribution are the mechanism.

## 2. What exists today (short version)

| Player | What it is | Gap |
| --- | --- | --- |
| `easytamiltyping.com` | Tamil99 / InScript / Typewriter test simulators, exam-speed content, SEO-strong | Tests, doesn't teach. Layout assumed pre-installed. Closed. Thin on akshara-level feedback. |
| `tamilkeyboard.in`, `indiatyping.com`, various `.in` typing portals | Layout diagrams, ad-monetised tests | Content farms; no pedagogy; no offline; no data. |
| Keyman keyboards (`thamizha_*`) | Rule-complete Tamil99-ext, New Typewriter, Bamini, Anjal Paangu | Keyboard drivers, not tutors. No curriculum, no scoring, no exam profiles. |
| `Thataan` (GitHub) | Tamil99 typing tutor | Unmaintained, desktop-era, no exam mode. |
| School/college typing institutes | Teaching + certificate prep, offline | No product surface; no measurement; no reach beyond the classroom. |
| Government | DOTE/TNDTE exam, certificate | Rules are published thinly; no practice infrastructure. |

**Whitespace:** nobody owns *teaching Tamil99/Typewriter as a layout* with authoritative, cited, machine-verifiable behaviour. That is the USP, and it is defensible because it requires real layout data engineering — the part that is boring to copy.

## 3. Users and jobs to be done

| # | Persona | Job | What they need that doesn't exist |
| --- | --- | --- | --- |
| U1 | **TNDTE aspirant** (16–30, often first-generation, shared/borrowed computer) | Pass Tamil Junior/Senior Grade typewriting | Zero-install practice on a machine they don't control; practice that mirrors the exam's passage typology and marking |
| U2 | **TNPSC Typist / Junior Assistant / Steno-Typist aspirant** | Hold a Senior Grade certificate to be eligible | Know exactly which grade combination is needed; train to it with cited targets |
| U3 | **Judicial / ministerial office candidate** | Typewriter-layout typing test | Typewriter and Bamini layouts taught properly, including reordering quirks |
| U4 | **School / ITI / polytechnic student** | Learn Tamil typing as a skill | Structured curriculum, not a timer; works offline on a lab PC |
| U5 | **Typing institute / tutor** | Run a batch, show measurable progress | Roster + assignment + progress export with no server, no accounts for students |
| U6 | **Notebook / Linux / Mac user** | Type Tamil at all | InScript + Tamil99 with the layout engine in the browser, so nothing to configure |
| U7 | **Visually impaired learner** | Learn touch typing | Audio-first drill mode: hear the akshara, type it, get an error cue |
| U8 | **Tamil diaspora learner** (incl. exam aspirants abroad) | Learn Tamil keyboarding without a teacher | Self-paced curriculum, bilingual UI, offline PWA |

Explicitly *not* a primary user: the casual user who wants to type a Tamil tweet once — that is transliteration, a different product (§9).

## 4. Scope

**Layouts (v1):** Tamil99 (Government variant), Tamil99 Extended (grantha), InScript (IS 13194:1991), Enhanced InScript (IS 16350:2016), Tamil Typewriter (New Typewriter / Suratha-Bamini lineage).
**Layouts (v1.1):** Bamini, Anjal Paangu (phonetic), TamilNet99 legacy variants.
**Languages:** Tamil script only in v1. Architecture must not assume a single script (Malayalam/Kannada/Telugu InScript are the same engine plus a data file) — but they are *not* v1 deliverables.

**Exam profiles (v1):** TNDTE/DOTE GTE Typewriting (Tamil Lower / Junior / Senior / High Speed, Paper I and Paper II), SSC DEST (Tamil), and a generic "TNPSC-implied Senior Grade" target. Every profile is data, cites its source, and is versioned (§7).

**Deployment surfaces:** installable PWA (works fully offline), static hosting (GitHub Pages + a Netlify mirror), and an embeddable "practice widget" route so institutes can iframe it.

## 5. Functional requirements

### FR-1 Layout engine
- **FR-1.1** Support both **stateless layouts** (key → codepoint, e.g. InScript) and **rule-based layouts** (context-sensitive, multi-stroke, reordering, e.g. Tamil99, Typewriter).
- **FR-1.2** Layout behaviour must be **data, not code** — adding a layout must not require changing engine source.
- **FR-1.3** Layout data must be traceable to a named normative source (BIS standard, TN Government notification, or an attributed open keyboard source) and carry that attribution in the UI.
- **FR-1.4** Two input modes: **Trainer mode** (app intercepts physical keys, applies the layout, renders Tamil, requires no OS configuration) and **Validation mode** (learner uses their own installed layout; app scores only).
- **FR-1.5** Per-keystroke **edit log**: for every keypress the app knows which rule fired and which codepoints it produced, so it can undo a composite in one step (Tamil99 auto-pulli, Typewriter dead keys) and attribute errors to a cause.
- **FR-1.6** Tamil-specific correctness: NFC normalisation on ingest and input; ZWNJ/ZWJ handling (e.g. blocking the க்ஷ ligature); Tamil digits, Tamil symbols ௳–௺ and ௹, and āytam must be reachable.
- **FR-1.7** On-screen keyboard overlay per layout per layer, with finger assignment, next-key hint, and a plain-language explanation of the rule about to fire.

### FR-2 Akshara (grapheme) correctness
- **FR-2.1** Segment Tamil into aksharas (grapheme clusters) consistently across browsers, including pulli clusters and ZWNJ cases.
- **FR-2.2** Scoring at **akshara level** for display and error attribution, and at **codepoint level** for layout drills.
- **FR-2.3** Normalisation-insensitive comparison: ொ ோ ௌ typed decomposed (base sign + U+0BBE / U+0BD7) must not be scored wrong; the app records which form was produced.
- **FR-2.4** An akshara mastery grid covering the full Tamil inventory, per layout, per user.

### FR-3 Curriculum and drills
- **FR-3.1** Ordered lesson graph: physical finger drills → home-row aksharas → vowels → matra combinations → pulli and auto-pulli → grantha → āytam → confusable pairs (ற/ர, ன/ன/ந, ள/ல/ழ) → Tamil digits and symbols → exam typology (letters, addresses, circulars, tabular matter) → speed blocks.
- **FR-3.2** Drill generation from **real Tamil vocabulary only** — no nonsense strings; drills must respect orthographic validity.
- **FR-3.3** Adaptive review: items the learner errs on return on a spaced schedule (item = akshara and/or layout rule).
- **FR-3.4** Unlock rubric: ≥97% accuracy *and* the lesson's speed target met twice consecutively.
- **FR-3.5** Every lesson states its objective in Tamil and English.

### FR-4 Test and exam engine
- **FR-4.1** Timed tests with exam-authentic behaviour: metrics hidden during the attempt, strict timer, auto-submit, focus-loss warning.
- **FR-4.2** Exam profiles as versioned data: duration, passage length, word convention, error policy, backspace policy, pass criteria, certificate wording, **source citation and last-verified date**.
- **FR-4.3** Marking conventions modelled explicitly: 5 characters = 1 word; gross and net speed; key-depressions-per-minute for SSC-style tests; full vs half errors.
- **FR-4.4** Results report: speed, accuracy, error taxonomy, error-to-cause attribution, weakest items, comparison against the target profile.
- **FR-4.5** Practice certificate (client-side PDF/print) clearly marked **"practice record — not a Government Technical Examination certificate"**, with an optional signed machine-verifiable JSON export.
- **FR-4.6** Profiles whose rules cannot be verified against an official source must be labelled *practice-only* in the UI. No claim of official parity without a citation.

### FR-5 Content
- **FR-5.1** Passage bank with per-passage provenance: source, licence, difficulty score (rare-letter density, matra density, cluster density, lexicon coverage).
- **FR-5.2** Passage linter: every token validated against a Tamil lexicon + orthographic rules; flagged forms excluded or reviewed.
- **FR-5.3** No PII, no news/opinion text, no scraped paywalled material.
- **FR-5.4** Institute-authored passages supported locally (never uploaded).

### FR-6 Progress, institutes, reporting
- **FR-6.1** All statistics local-first (IndexedDB); no account required to use the product.
- **FR-6.2** Optional export: JSON/CSV of attempts, printable progress report.
- **FR-6.3** Teacher/institute mode: local class roster (first-name/handle only, no PII required), assignment of drill sets, aggregate class view, offline CSV export.
- **FR-6.4** "Report a layout bug" generates a minimal reproducible keystroke log (keys, expected, actual, layout revision) — crowdsourcing layout data quality without collecting user data.

### FR-7 Interface
- **FR-7.1** Bilingual UI, **Tamil default**, English toggle; no hardcoded strings.
- **FR-7.2** Three-pane typing view: akshara-chunked target, typed mirror with per-akshara status, live metric strip.
- **FR-7.3** Session debrief: taxonomy breakdown and a generated drill set from the learner's own errors.
- **FR-7.4** Keyboard-navigable end to end; no time pressure in learning mode.

## 6. Non-functional requirements

| Area | Requirement |
| --- | --- |
| **Offline** | Full functionality with no network after first load. All layouts, lessons and passages bundled/installed. Installable PWA. |
| **Performance** | Keystroke-to-render < 16 ms; typing view holds 60 fps; usable on a 2015-era Android tablet or low-end Windows laptop. |
| **Weight** | Initial JS ≤ 250 KB gzipped; Tamil webfont subset only if needed (system Noto Sans Tamil preferred). |
| **Privacy** | No accounts, no ads, **no telemetry by default**. Any aggregate sharing is explicit opt-in, per-session, and explained in Tamil. |
| **Accessibility** | WCAG 2.2 AA. Adjustable font size to 24 px+ in Tamil, contrast modes, no colour-only signalling, screen-reader announcements of akshara and error, and an **audio-first drill mode** for visually impaired learners. |
| **Browsers** | Last two versions of Chromium, Firefox, Safari (desktop + iOS), Android Chrome. Safari keyboard-event quirks handled explicitly. |
| **Licensing** | Code and content under open licences with no proprietary capture; layout data retains upstream attribution. (Licence choice — §10 Q2.) |
| **Verifiability** | Every speed formula, exam profile and layout mapping surfaces its source and last-verified date in the UI. |
| **Longevity** | Static build; no server-side dependency for core learning; data files are versioned and diffable; a learner's saved progress remains readable without the app. |

## 7. Success metrics

- **Learning:** median time from first session to sustained 15 WPM; share of learners reaching their target exam speed within 6 weeks of practice.
- **Pedagogy:** accuracy trajectory per lesson; akshara mastery coverage growth; error recurrence rate after adaptive review.
- **Data quality:** 100% of layout rules covered by golden tests; zero unresolved layout-mismatch reports older than 30 days.
- **Coverage:** share of the Tamil orthographic inventory exercised by the passage bank; passage licence audit complete.
- **Reach:** offline installs, institute deployments, and passages of the layout data into other projects (the data is meant to be reused).

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Layout data licensing unclear for third-party keyboard sources | Verify per source before vendoring; derive tables from BIS/TN normative documents and X11 `xkeyboard-config` (permissive) where possible; keep Keyman sources as reference-only until licence is confirmed |
| Scoring semantics disagree with exam evaluators | Publish formulas with citations; label unverified profiles *practice-only*; make error policy configurable per profile |
| Browser input fidelity (Safari, IME interference, dead keys) | Trainer mode owns the keystroke and bypasses OS layout entirely; explicit per-browser test matrix |
| Low-end device performance | Budgeted bundle, benchmarked in CI, no framework-heavy animation |
| Rule/manual drift (TN government changes notifications) | Versioned profiles with last-verified dates; a review cadence note in the repo |
| Incumbent SEO moat (`easytamiltyping`) | Don't compete on test pages; compete on teaching quality, openness, offline, institute mode, and reusable data |
| Scope creep into transliteration / other scripts | Non-goals are explicit (§9) |

## 9. Non-goals

- Transliteration ("type Tamil in English letters") — a different product with a different mental model.
- An OS-level keyboard driver or an installable mobile IME. (Trainer mode in the browser replaces the need; a native IME is a *possible* future project, not this one.)
- TACE16 / TAB / TSCII legacy encodings. Unicode only. (A read-only legacy converter could be a separate tool.)
- Exam registration, certificate issuance, or proctoring.
- Support for languages other than Tamil in v1 (engine must allow it; the work is not scheduled).
- Accounts, cloud sync, leaderboards, ads, or any monetisation of learner data.
- Voice/stenography training.

## 10. Decisions needed from the user

| # | Decision | Recommendation |
| --- | --- | --- |
| Q1 | Product name | Keep codename **Kalappai**; alternates Thaṭṭezhuthi / Ezhuthu |
| Q2 | Licence split | Code **AGPL-3.0** (prevents closed SaaS capture of a public-interest tool); content CC BY-SA 4.0; layout data MIT + upstream attribution. Alternative: MIT code if maximum reuse matters more |
| Q3 | Hosting | Static on GitHub Pages + Netlify mirror, custom domain (`kalappai.in` / `tamiltyping.org`-style); a zo.space route only as a demo/embed |
| Q4 | Build route | Build it as a normal repo (Vite + React + TS + Tailwind, matching house style), *not* through the LogicInc factory in v1 — the layout-data work is sequential and research-heavy |
| Q5 | v1 layout set | Tamil99 (govt + extended), InScript (IS 13194), Enhanced InScript (IS 16350), New Typewriter. Bamini + Anjal Paangu in v1.1 |
| Q6 | Exam profiles at launch | TNDTE GTE (Tamil) + SSC DEST + TNPSC-implied, each cited; add Kerala/Sri Lanka only when sourced |
| Q7 | Certificate | Practice-only certificate, no signature by default; optional signed JSON if institutes ask for verifiability |
| Q8 | First pilot | One typing institute + one school batch, offline, to validate the drill graph and the marking model before public launch |

## 11. Phasing summary

| Phase | Deliverable | Exit criterion |
| --- | --- | --- |
| M0 | Repo, layout IR, Tamil99 compiled and golden-tested | Replay corpus matches reference behaviour for every rule |
| M1 | Trainer mode + akshara engine + scorer + first 40 lessons (Tamil99) | A learner can go from zero to typing Tamil99 words with per-key guidance, offline |
| M2 | Exam engine + TNDTE/SSC profiles + results report + practice certificate | A TNDTE aspirant can rehearse a full exam-shaped attempt and get a defensible score |
| M3 | InScript, Enhanced InScript, Typewriter layouts in validation + trainer modes | 100% golden coverage across four layouts |
| M4 | Passage bank v1 with licences and difficulty scoring | 500 passages, audited provenance, linting clean |
| M5 | Adaptive review, mastery grid, institute mode, exports | An institute can run a batch and export progress without any server |
| M6 | Accessibility audit, bilingual completeness, public launch | WCAG 2.2 AA pass; Tamil/English UI complete; installer/offline verified on low-end hardware |
