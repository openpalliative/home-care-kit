#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p _reports
if [ "${HC_FIXTURES:-}" = "1" ]; then
  printf '{"ok": false, "step": "HC_FIXTURES"}\n' > _reports/gate.json
  echo "Ворота не запускаются с HC_FIXTURES=1: это сборка на выдуманных данных. Ворота сами прогоняют e2e на фикстурах отдельным шагом"
  exit 1
fi
STEP=""
fail() { printf '{"ok": false, "step": "%s"}\n' "$STEP" > _reports/gate.json; echo "Ворота не пройдены на шаге: $STEP"; exit 1; }
run() { STEP="$1"; shift; echo "== $STEP"; "$@" || fail; }
run "uv sync" uv sync --frozen
run "pnpm install" pnpm install --frozen-lockfile
run "actionlint" sh scripts/actionlint
run "pytest" uv run pytest -q
run "audit" uv run python -m pipeline.audit
run "build" env OP_TARGET=pages uv run python -m opsite build
run "check" env OP_TARGET=pages uv run python -m opsite check --ci
run "indications" uv run python scripts/indications_gate.py
run "unit" pnpm test:unit
run "e2e" env OP_TARGET=pages pnpm test:e2e
run "shots" env OP_TARGET=pages pnpm shots
run "build on fixtures" env HC_FIXTURES=1 OP_TARGET= uv run python -m opsite build
run "e2e on fixtures" env HC_FIXTURES=1 OP_TARGET= pnpm test:e2e
run "build again" env OP_TARGET=pages uv run python -m opsite build
printf '{"ok": true}\n' > _reports/gate.json
echo "Ворота пройдены"
