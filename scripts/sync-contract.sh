#!/usr/bin/env bash
# Re-vendor the certification-service contract from the service repository.
#
# The service owns the contract (LogicIncZo/kalappai-cert, src/contract.ts). This
# app consumes it and pins the exact bytes it was built against, so a change on the
# service side is always a deliberate, reviewable commit here.
#
#   bash scripts/sync-contract.sh                       # from the sibling checkout
#   bash scripts/sync-contract.sh --from-github         # from the service repo on GitHub
#   bash scripts/sync-contract.sh --check               # verify only, do not write
#
# After a real re-vendor, run `bun run verify` and commit the artifact, the pin and
# any src/App.tsx change together — never the artifact alone.
set -uo pipefail

cd "$(dirname "$0")/.."

ARTIFACT="contract/cert-service.v1.json"
PIN="contract/PINNED.sha256"
SIBLING="${KALAPPAI_CERT_REPO:-../kalappai-cert}/$ARTIFACT"
RAW="https://raw.githubusercontent.com/LogicIncZo/kalappai-cert/main/contract/cert-service.v1.json"

MODE="sibling"
case "${1:-}" in
  --from-github) MODE="github" ;;
  --check) MODE="check" ;;
  "") ;;
  *) echo "usage: $0 [--from-github|--check]" >&2; exit 2 ;;
esac

GREEN='\033[0;32m'; RED='\033[0;31m'; DIM='\033[2m'; NC='\033[0m'

have_pin=$(cat "$PIN" 2>/dev/null || echo "")
have_sum=$(sha256sum "$ARTIFACT" | cut -d' ' -f1)

if [ "$MODE" = "check" ]; then
  if [ "$have_pin" = "$have_sum" ]; then
    echo -e "${GREEN}✓${NC} vendored contract matches its pin ${DIM}(${have_sum:0:12}…)${NC}"
    exit 0
  fi
  echo -e "${RED}✗${NC} vendored contract does not match its pin"
  echo "    pinned: $have_pin"
  echo "    actual: $have_sum"
  exit 1
fi

tmp=$(mktemp)
if [ "$MODE" = "github" ]; then
  echo -e "${DIM}fetching $RAW${NC}"
  if ! curl -fsSL "$RAW" -o "$tmp"; then
    echo -e "${RED}✗${NC} could not fetch the contract from GitHub"; rm -f "$tmp"; exit 1
  fi
else
  if [ ! -f "$SIBLING" ]; then
    echo -e "${RED}✗${NC} no sibling checkout at $SIBLING"
    echo "    clone LogicIncZo/kalappai-cert next to this repo, or use --from-github"
    rm -f "$tmp"; exit 1
  fi
  cp "$SIBLING" "$tmp"
fi

new_sum=$(sha256sum "$tmp" | cut -d' ' -f1)
cp "$tmp" "$ARTIFACT"
rm -f "$tmp"
printf '%s\n' "$new_sum" > "$PIN"

if [ "$new_sum" = "$have_sum" ]; then
  echo -e "${GREEN}✓${NC} already current ${DIM}(${new_sum:0:12}…)${NC}"
else
  echo -e "${GREEN}✓${NC} re-vendored: ${have_sum:0:12}… → ${new_sum:0:12}…"
  echo "    now run: bun run verify"
fi
