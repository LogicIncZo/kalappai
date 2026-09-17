# Kalappai — product plan

Strategy doc. Execution lives in [`BACKLOG.md`](../BACKLOG.md); entries here graduate
there when they are specified enough to start. Reviewed 2026-09-17 against the
market scan at `ThamizhKanimai/notes/2026-09-12-indic-typing-tutor-landscape.md`.

## Where the product stands

Built and gated: a Tamil-first typing tutor PWA (4 in-browser layouts, 5 chapters /
13 lessons / 59 exercises, per-keystroke rule explainers, TNDTE-style exam mode,
optional verifiable certificates). The engineering loop is the asset: a 9-stage
gate, a pinned certification contract with conformance suites on both sides, and
demo infrastructure. The engine thesis — *the browser owns the keystroke* — is
shipped and defensible.

Not built: the product around the engine. One exam passage (generic), no exam
profiles, English-only UI chrome, one certificate trust tier (self-reported), no
institute surface, no distribution. Demand in this market is certificate-driven
(TNDTE Feb/Aug cycles, TNPSC typist thresholds, CPCT, SSC DEST); none of that
demand has a tailored surface yet.

## Thesis

**We are not selling typing practice. We are selling a printed, verifiable record
of typing ability to people whose livelihood depends on it.**

Exam aspirants don't pick tutors; they pick the shortest path to a certificate the
government recognises. Incumbents time keystrokes; Typetera validates; nobody
teaches layouts in-browser with akshara-correct scoring *and* issues a credential
a third party can verify. The wedge is not the tutor — it is the honest record at
the end of it. That is also the part competitors cannot copy without rebuilding
their trust model.

## The one number

**Certificates issued per week.** It requires finishing an exam (engagement), it
is the value moment (the printable record), and it is countable server-side as an
aggregate with no PII. Everything in NOW exists to move this number. Casual
lesson completions are the funnel, not the goal.

## Now (next iterations, in order)

1. **Exam profiles as data.** Three profiles: TNDTE Junior (Tamil), TNDTE Senior
   (Tamil), TNPSC-implied Senior Grade. Each is a versioned data file citing its
   source (REQUIREMENTS §7): passage bank (≥5 passages each, typology-matched),
   duration, marking rules, target line. Exam mode grows a profile picker; the
   generic passage stays as the default profile. This is the U1/U2 job and the
   biggest gap between the spec and the product.
2. **Attestation tier (two-repo).** Cert repo backlog #1 first (server accepts a
   keystroke-sample block, stamps `trustLevel` inside the signed record), then the
   app client half. Omission never fails; a fabricated attestation is refused, not
   downgraded. One contract bump covers both this and the metric:
   `GET /api/issuer` gains an aggregate `issued` count so the one number is
   observable without a second contract cycle.
3. **The certificate as an artefact.** Print stylesheet for the verify page
   (backlog #1) and in-app WebCrypto verification (backlog #2). The certificate is
   what gets handed to an institute or employer; its paper form and its
   scan-to-verify path are product surface, not polish.

## Next (1–2 months, after Now lands)

- **Bilingual UI (TA + EN).** UI chrome is English-only today; the cohort and the
  SEO surface both need Tamil.
- **Validation mode (FR-1.4).** Learner uses their own installed OS layout; the
  app scores only. Exam-centre realism; cheap because scoring already separates
  from key production.
- **Mastery grid (FR-2.4) + weak-spot coaching.** Retention mechanics in service
  of the one number.
- **Bamini layout.** Pull forward from v1.1: the judicial/ministerial cohort (U3)
  has no modern option.
- **Institute mode, minimal.** Embeddable route + per-batch progress export
  (JSON/CSV from localStorage). No accounts, no server — institutes assign,
  students bring the PWA, tutors collect exports. This is the distribution
  channel for the Feb 2027 TNDTE cycle.

## Later (evaluate monthly; most graduate to never)

- Audio-first drill mode + a non-typing cognizance route (U7; cert backlog #3).
- Community passage banks with provenance gates.
- Other Indic scripts (engine is script-agnostic by design) — only after Tamil
  proves the model.
- Mobile layout keyboards — layout typing is desktop-exam-bound; Gboard owns
  casual mobile.

## Never

- Accounts, telemetry, cloud save (invariant #6; institute mode stays export-based).
- Casual transliteration-first positioning — translit is the on-ramp lesson, not the product.
- Paid exam-dump walls; passages stay open and source-cited.
- Ads.

## Business model

Near-term revenue is ₹0, by design. Monetisation is only proven in exam prep
(₹99–499 packs, institute licences); the credible route here is institute
licences after institute mode exists — and the public-good record may keep it
free. Do not bolt a paywall onto the core loop; the honesty positioning is the
moat and a paywall undercuts it.

## Go-to-market

- **Timing:** land Now before TNDTE Feb 2027 registration opens; institutes
  decide in the 8–10 weeks before a cycle.
- **Channels we already own:** tri-lingual YouTube Shorts (cc-yt-shorts pipeline)
  — "Tamil99 vs InScript: which for TNPSC?" is a made-for-shorts question;
  ThamizhKanimai notes and the CashlessWatch ecosystem for SEO; the OSS repo
  itself (monkeytype playbook).
- **Competitive check before locking copy:** verify Typetera's /learn depth and
  whether their Tamil test does real in-browser remap (landscape note, next-step
  #1). Our claim is "we teach the layout and attest the result" — it must stay
  true on the day they ship a learn page.

## Risks

- **Content is the bottleneck, not code.** Exam profiles need sourced, versioned
  passages — editorial work the loop must budget iterations for.
- **Single-loop capacity.** The gate makes each iteration safe but not free;
  Now is three iterations, not one.
- **Provenance sloppiness.** One uncited passage undermines the honesty brand the
  certificates depend on. The §7 versioning rules are not optional.
