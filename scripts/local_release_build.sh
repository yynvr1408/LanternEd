#!/usr/bin/env bash
set -euo pipefail

# Build local LanternED release artifacts for host-supported apps and enforce the latest-2 retention rule.
# Usage:
#   ./scripts/local_release_build.sh [--version 0.1.6] [--targets auto|all] [--keep 2] [--fetch-missing-from-release v0.1.6]

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${REPO_ROOT}/backend/venv/bin/python"
if [ ! -x "$PYTHON_BIN" ]; then
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
  else
    PYTHON_BIN="python"
  fi
fi

exec "$PYTHON_BIN" "${REPO_ROOT}/scripts/ci_release.py" local-build "$@"
