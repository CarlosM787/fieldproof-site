#!/usr/bin/env bash
# One command per pilot (Linux, macOS, WSL, Git Bash). On Windows PowerShell use: py run.py <what>
#   ./run.sh pilot-a | pilot-b | thumbs | check | all   [--out DIR] [--final] [--floor-dir DIR] [--only long|short]
set -euo pipefail
cd "$(dirname "$0")"
exec "${PYTHON:-python3}" run.py "$@"
