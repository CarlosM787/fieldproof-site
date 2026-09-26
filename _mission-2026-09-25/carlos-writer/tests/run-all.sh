#!/usr/bin/env bash
# Runs every Carlos Writer test that works in this Linux container.
#   1. unit tests (node --test)                         prompts, diff, providers, Anthropic request shape
#   2. headless browser tests (message path)            tests/e2e/run-e2e.js
#   3. real keyboard shortcuts under Xvfb (XTEST keys)  tests/e2e/run-keyboard.js   (needs python-xlib, see below)
#   4. optional: the real Ollama binary, no model       tests/e2e/run-real-ollama.js (set OLLAMA_BIN)
# python-xlib for step 3:  pip install --target "$ROOT/_work/pylib" python-xlib
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p _work tests/results
fail=0
echo "== unit"; node --test --test-concurrency=1 tests/unit/*.test.js > tests/results/unit.tap 2>&1; tail -9 tests/results/unit.tap | grep -E "^# (tests|pass|fail)"; grep -q "^# fail 0" tests/results/unit.tap || fail=1
echo "== e2e (headless, message path)"; node tests/e2e/run-e2e.js > tests/results/e2e-headless.log 2>&1 || fail=1; tail -2 tests/results/e2e-headless.log
echo "== keyboard (headed under Xvfb, real key events)"
if [ -d "$ROOT/_work/pylib/Xlib" ] && command -v xvfb-run >/dev/null; then
  xvfb-run -a -s "-screen 0 1280x1000x24" node tests/e2e/run-keyboard.js > tests/results/e2e-keyboard.log 2>&1 || fail=1; tail -1 tests/results/e2e-keyboard.log
else echo "skipped (no python-xlib or xvfb-run)"; fi
if [ -n "${OLLAMA_BIN:-}" ]; then
  echo "== real Ollama binary (no model)"
  export HOME_OLLAMA="$ROOT/_work/ollama-home"; mkdir -p "$HOME_OLLAMA/models"
  HOME="$HOME_OLLAMA" OLLAMA_MODELS="$HOME_OLLAMA/models" OLLAMA_HOST=127.0.0.1:11434 "$OLLAMA_BIN" serve > _work/ollama-serve.log 2>&1 &
  OPID=$!; sleep 3
  node tests/e2e/run-real-ollama.js > tests/results/real-ollama.log 2>&1 || fail=1; tail -1 tests/results/real-ollama.log
  kill $OPID
fi
echo "== style guide quotes (private)"; if [ -f private/build-style-guide.js ]; then node private/build-style-guide.js || fail=1; else echo "skipped (no private folder)"; fi
exit $fail
