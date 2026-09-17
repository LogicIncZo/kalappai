# Backlog

The loop's queue. Each entry states what "done" means, because a loop that cannot
tell when it is finished does not stop — it wanders.

Conventions:

- **Ready** entries are specified enough to start without asking anything.
- **Blocked** entries name the blocker.
- **Landed** entries move to [`CHANGELOG.md`](CHANGELOG.md) and are deleted here.
- One loop iteration takes one entry. If an entry turns out to be three things,
  split it rather than half-finishing it.
- Anything that touches the certification contract is a two-repo change — see
  [`CONTRIBUTING.md`](CONTRIBUTING.md) → "Changing the contract".

---

## Ready

### 1. Print stylesheet for the verify page

**Why.** The verify page is the one artefact a learner is expected to hand to a
third party, and it is currently printed by the browser's default rules: the
navigation, the "Built on Zo" badge and the dark panel background all come along,
which on paper is both ugly and expensive in toner. A certificate that looks
untrustworthy is a certificate that does not get presented.

**Done when.**

- The verify page declares `@media print` rules: light background, no navigation,
  no interactive controls, QR and the signature block kept together on one page.
- A `demo:walkthrough` step captures the print layout (screenshot in print
  emulation) so the stylesheet cannot silently rot.
- `check-docs` still passes: the page's honest-labelling sentence ("practice
  record, not a TNDTE or TNPSC certificate") must survive the print stylesheet.

### 2. In-app verification of a certificate id

**Why.** A learner can currently *receive* a certificate but not *check* one
without the issuing server being reachable in a browser. The interesting case is a
verifier holding a printed certificate and a phone: scan the QR, get the id, and
be told whether it verifies — without trusting the page the issuer serves.

**Done when.**

- The app can verify a certificate against a user-supplied certification server:
  fetch `GET /api/issuer`, fetch the certificate, and check the EdDSA signature of
  the VC-JWT against the published JWKS **in the browser**, via WebCrypto.
- The result names what was checked (signature, issuer key, pass rules) and what
  was not.
- It works with the certification service unreachable for everything except the
  fetch, and it never claims more than the signature proves.
- Contract-affecting: the fields it reads must exist in
  `contract/cert-service.v1.json`, so this is a two-repo change if the service
  must expose anything new.

### 3. `translit` coverage in the self-check

**Why.** `selfCheck()` deliberately skips the transliteration layout — it proves
coverage for the three key-driven layouts and defers translit to the golden
corpus. The consequence is that a lesson can be added that translit cannot type,
and the gate will not notice.

**Done when.**

- `selfCheck()` covers `translit` by attempting its ordered rewrite rules instead
  of only the stateless/key-driven engines, or
- `check-docs` reports translit coverage separately and the golden corpus is large
  enough to make the claim meaningful, and
- whichever route is taken, the coverage number is stated in `README.md` (so
  `check-docs` holds it to the code).

---

## Blocked

### 4. Attestation tier on issued certificates (client half)

**Blocked on:** [`LogicIncZo/kalappai-cert`](https://github.com/LogicIncZo/kalappai-cert)
backlog item 1 — server-side attestation for `POST /api/certificates`.

**Why.** Today the app sends a self-reported score and the server enforces
plausibility. That catches a sloppy forgery and nothing else. The certification
repo already has the attestation machinery (the cognizance gate: server-opened
sessions, issuer-counted reveals, keystroke-derived metrics); what is missing is a
certificate-shaped path through it.

**Done when.** The app can offer an *attested* examination — keystroke samples
streamed as they are typed rather than summarised at the end — and the resulting
credential is stamped with its trust level, so a verifier can tell an attested
record from a self-reported one. Users who decline must still get the ordinary
certificate.

**Note.** Do not start this until the service side lands: the client shape depends
on the request the service is willing to accept.
