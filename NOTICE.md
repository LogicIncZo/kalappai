# NOTICE — provenance of externally-derived material

Kalappai is original code, but its layout definitions are ported from named upstream
sources. Every externally-derived artefact and its licence:

| Artefact | Upstream source | Upstream licence | Use here |
| --- | --- | --- | --- |
| Tamil99 Extended rules | thamizha Tamil99 Extended Keyman keyboard (`keymanapp/keyboards`, © thamizha.com and SIL Global) | MIT | ported rule-for-rule into `src/engine.ts`; golden corpus replays its published behaviour |
| Tamil Typewriter rules | thamizha New Typewriter Keyman keyboard (same project) | MIT | ported, incl. visual→logical matra reordering |
| InScript (Tamil) | `xkb-data` `symbols/in` `tam` variant (X Keyboard Config, MIT/X11-style per-file headers) | per xkeyboard-config | ported shift-level map |
| Phonetic (transliteration) rules | `wikimedia/jquery.ime` `rules/ta/ta-transliteration.js` (© Wikimedia and contributors) | GPL-2.0-or-later (per-file header) | ordered rewrite rules ported to a trie-backed engine; pinned copy in `docs/ref/` |
| Noto Sans Tamil | Google Fonts | OFL | linked at runtime, cached by the service worker |

Reference copies of the upstream sources are pinned in `docs/ref/`.

The tamil99 layout concept itself is the TamilNet99 standard (Tamil computing
community). Exam scoring conventions (net WPM = (chars − errors)/5/min, KDPH) are
standard typing-industry formulas; exam passages in this app are original and are
explicitly **not** official TNDTE/TNPSC question papers.

Because the transliteration rule data is GPL-2.0-or-later, this project as a whole
is distributed under GPL-3.0-or-later (see LICENSE), which is compatible upstream.

Original code, lesson corpus, exam passage, UI and the certification server:
© 2026 LogicInc / CashlessConsumer, GPL-3.0-or-later.

## Runtime dependencies

- `qrcode` (MIT) — QR generation on certificate verify pages (now in the [kalappai-cert](https://github.com/LogicIncZo/kalappai-cert) backend).
