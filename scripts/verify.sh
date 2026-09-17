#!/usr/bin/env bash
# kalappai — loop-engineering verification gate.
#
# One command that decides whether a change to this app may be committed, pushed
# or deployed. Every stage is a claim about the app that something other than a
# human has to be able to check:
#
#   1. contract       — the vendored certification contract still hashes to its pin,
#                       and the app still speaks the fields it declares
#   2. docs           — README's claims are derived from code, not prose
#   3. typecheck      — tsc, including the scripts that run these gates
#   4. lint           — biome (lint only; the formatter is deliberately off)
#   5. tests          — engine golden corpus + self-check + tokenizer
#   6. build          — vite build produces the PWA
#   7. smoke:dist     — serves dist/ and asserts the PWA invariants
#   8. demo           — the seeded learner state replays through the engine
#   9. hygiene        — no secrets, no committed build output, no stray root files
#
# Usage:  bun run verify          (all stages)
#         bun run verify --full   (also drive the browser walkthrough)
#         bun run verify --fast   (contract, docs, types, tests — the inner loop)
#
# Exits non-zero on the first failing stage, so it can gate a commit hook, CI, or
# a loop iteration. Nothing here reaches the network: the deployed surfaces are
# checked by `bun run smoke:live`, which is a deployment gate, not a build gate.

set -uo pipefail

FAST=0
FULL=0
for a in "$@"; do
  [ "$a" = "--fast" ] && FAST=1
  [ "$a" = "--full" ] && FULL=1
done

BOLD='\033[1m'; RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; DIM='\033[2m'; NC='\033[0m'

cd "$(dirname "$0")/.."
LOG_DIR="$(mktemp -d)"
fail=0
ran=0

step() { echo ""; echo -e "${BOLD}$1${NC}"; }

summary() {
  echo ""
  if [ "$fail" -eq 0 ]; then
    echo -e "${GREEN}${BOLD}✓ Verification passed${NC} ${DIM}(${ran} stages)${NC}"
  else
    echo -e "${RED}${BOLD}✗ Verification failed${NC}"
  fi
}

run_stage() {
  local name="$1"; shift
  ran=$((ran + 1))
  if "$@" > "$LOG_DIR/$name.log" 2>&1; then
    echo -e "  ${GREEN}✓${NC} ${name}"
  else
    echo -e "  ${RED}✗${NC} ${name} — output below:"
    echo ""
    sed 's/^/    /' "$LOG_DIR/$name.log" | tail -40
    fail=1
    summary
    exit 1
  fi
}

if ! command -v bun >/dev/null 2>&1; then
  echo -e "${RED}✗ bun not found — this repo runs on bun${NC}"
  exit 1
fi

echo -e "${BOLD}kalappai — verification gate${NC} ${DIM}$([ "$FAST" -eq 1 ] && echo '(fast: lint, build, smoke, demo skipped)')${NC}"

step "1/9  Contract (vendored certification contract still matches its pin)"
run_stage "contract:check" bun run contract:check

step "2/9  Docs (README claims are derived from code)"
run_stage "docs:check" bun run docs:check

step "3/9  Typecheck"
run_stage "typecheck" bun run typecheck

if [ "$FAST" -eq 0 ]; then
  step "4/9  Lint"
  run_stage "lint" bun run lint
else
  echo ""
  echo -e "${YELLOW}–${NC} 4/9  Lint ${DIM}(skipped)${NC}"
fi

step "5/9  Tests (engine golden corpus + self-check + tokenizer)"
run_stage "test" bun run test

if [ "$FAST" -eq 0 ]; then
  step "6/9  Build (PWA)"
  run_stage "build" bun run build
else
  echo ""
  echo -e "${YELLOW}–${NC} 6/9  Build ${DIM}(skipped)${NC}"
fi

# The PWA invariants are claims about the shipped artifact, so they can only be
# checked against a real build: manifest fields, service worker, icon sizes, base
# path, no dev-only references, and the engine booting without page errors.
if [ "$FAST" -eq 0 ]; then
  step "7/9  PWA smoke (serves dist/ and asserts the installable-app invariants)"
  run_stage "smoke:dist" bun run smoke:dist
else
  echo ""
  echo -e "${YELLOW}–${NC} 7/9  PWA smoke ${DIM}(skipped)${NC}"
fi

# The demo is a claim about the engine: a seeded learner state that no longer
# resolves to real lessons is a broken demo, and a broken demo is worse than none.
if [ "$FAST" -eq 0 ]; then
  if [ "$FULL" -eq 1 ]; then
    step "8/9  Demo (browser walkthrough: book → lesson → typing → exam → certificate)"
    run_stage "demo:walkthrough" bun run demo:walkthrough
  else
    step "8/9  Demo (seeded progress replays through the engine)"
    run_stage "demo:seed" bun run demo:seed --check
  fi
else
  echo ""
  echo -e "${YELLOW}–${NC} 8/9  Demo ${DIM}(skipped)${NC}"
fi

step "9/9  Hygiene (no secrets, no committed build output, no stray root files)"
ran=$((ran + 1))  # hygiene checks inline; count it so the summary is honest
hygiene_fail=0

# Build output and dependencies are reproducible, so they never belong in git.
if git ls-files | grep -qE '^(dist|node_modules)/'; then
  echo -e "  ${RED}✗${NC} build output or dependencies are tracked — they are reproducible"
  git ls-files | grep -E '^(dist|node_modules)/' | head -5 | sed 's/^/      /'
  hygiene_fail=1
else
  echo -e "  ${GREEN}✓${NC} dist/ and node_modules/ are outside version control"
fi

# The certificate service's runtime state is never this repo's business.
if git ls-files | grep -qE '\.(db|sqlite)$'; then
  echo -e "  ${RED}✗${NC} a database file is tracked"
  hygiene_fail=1
else
  echo -e "  ${GREEN}✓${NC} no database files tracked"
fi

# No long hex strings that look like a live secret in tracked source.
if git grep -nIE '(SECRET|TOKEN|API_KEY|PASSWORD)\s*[:=]\s*"[0-9a-fA-F]{16,}"' -- src scripts test demo >/dev/null 2>&1; then
  echo -e "  ${RED}✗${NC} a hardcoded secret-shaped literal appears in tracked source"
  git grep -nIE '(SECRET|TOKEN|API_KEY|PASSWORD)\s*[:=]\s*"[0-9a-fA-F]{16,}"' -- src scripts test demo | sed 's/^/      /'
  hygiene_fail=1
else
  echo -e "  ${GREEN}✓${NC} no hardcoded secret-shaped literals in tracked source"
fi

# The pinned contract must be present and pinned — an unpinned vendored contract
# is how the app silently drifts from the service.
if [ ! -f contract/cert-service.v1.json ] || [ ! -f contract/PINNED.sha256 ]; then
  echo -e "  ${RED}✗${NC} the vendored contract or its pin is missing"
  hygiene_fail=1
else
  echo -e "  ${GREEN}✓${NC} vendored contract and SHA-256 pin are present"
fi

# The gate must not be able to pass by having been edited into a no-op.
if ! grep -q "bun run contract:check" scripts/verify.sh \
   || ! grep -q "bun run docs:check" scripts/verify.sh \
   || ! grep -q "bun run smoke:dist" scripts/verify.sh \
   || ! grep -q "bun run demo:seed --check" scripts/verify.sh; then
  echo -e "  ${RED}✗${NC} this gate no longer runs the contract, docs, smoke and demo checks"
  hygiene_fail=1
fi

# No stray files at the repo root: everything has a home in the layout table.
stray=0
for f in $(git ls-files --others --exclude-standard -- . | grep -v '/' || true); do
  case "$f" in
    .editorconfig|.gitignore|AGENTS.md|BACKLOG.md|CHANGELOG.md|CONTRIBUTING.md|LICENSE|NOTICE.md|README.md|biome.json|index.html|package.json|tsconfig.json|vite.config.ts) ;;
    *) echo -e "  ${RED}✗${NC} untracked file at the repo root: $f"; stray=1 ;;
  esac
done
if [ "$stray" -eq 0 ]; then
  echo -e "  ${GREEN}✓${NC} no stray files at the repo root"
fi
[ "$stray" -eq 0 ] || hygiene_fail=1

if [ -n "$(git status --porcelain -- . | grep -vE '^\?\? ' || true)" ]; then
  echo -e "  ${YELLOW}!${NC} tracked files are modified — the gate runs on the working tree, not on a commit"
fi

[ "$hygiene_fail" -eq 0 ] || { fail=1; summary; exit 1; }
echo -e "  ${GREEN}✓${NC} hygiene"

summary
exit 0
