#!/usr/bin/env bash
# Unified test suite runner for LanternEd on Linux/macOS/CI environments.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SKIP_LIVE="${SKIP_LIVE:-false}"
FAST="${FAST:-false}"

echo "======================================================================"
echo "  LanternEd Full Test Suite Runner (POSIX / CI)"
echo "======================================================================"
echo "Root: $ROOT_DIR"
echo "Date: $(date)"
echo ""

FAILED_SUITES=()

run_suite() {
  local name="$1"
  shift
  echo ">>> Running: $name..."
  if "$@"; then
    echo " [PASS] $name"
  else
    echo " [FAIL] $name"
    FAILED_SUITES+=("$name")
  fi
  echo ""
}

# 1. Backend Pytest
run_suite "Backend Pytest (API, DB, Media, STT, Auth)" pytest backend/tests -v

# 2. Frontend Lint
run_suite "Frontend Linter (oxlint)" npm --prefix frontend run lint

# 3. Frontend Type Check & Build
run_suite "Frontend Build & Typecheck (tsc + vite build)" npm --prefix frontend run build

# 4. Frontend Vitest Unit Tests
run_suite "Frontend Unit Tests (Vitest)" npm --prefix frontend test

if [ "$FAST" != "true" ]; then
  # 5. Playwright Layout Tests
  run_suite "Playwright Responsive Layout Suite" npm --prefix frontend run test:e2e:layout

  # 6. Playwright Offline Shell & Sync Tests
  run_suite "Playwright Offline Shell & Playback Suite" npm --prefix frontend run test:e2e:offline

  # 7. Playwright Real Backend Stack Tests
  run_suite "Playwright Real Stack Integration Suite" npm --prefix frontend run test:e2e:real

  # 8. Playwright Live Cloud WebRTC Tests
  if [ "$SKIP_LIVE" != "true" ]; then
    run_suite "Playwright Live Cloud WebRTC Suite" npm --prefix frontend run test:e2e:live
  else
    echo " [SKIP] Playwright Live Cloud WebRTC Suite (SKIP_LIVE=true)"
  fi
fi

echo "======================================================================"
echo "  Test Summary"
echo "======================================================================"
if [ ${#FAILED_SUITES[@]} -eq 0 ]; then
  echo "ALL TEST SUITES PASSED!"
  exit 0
else
  echo "THE FOLLOWING SUITES FAILED:"
  for s in "${FAILED_SUITES[@]}"; do
    echo "  - $s"
  done
  exit 1
fi
