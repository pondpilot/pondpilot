#!/usr/bin/env bash
set -euo pipefail

IMAGE="mcr.microsoft.com/playwright:v1.57.0-jammy"
MODE="${1:-test}"
PLAYWRIGHT_WORKERS="${PLAYWRIGHT_WORKERS:-4}"
TTY_FLAGS="-i"

if [ -t 1 ]; then
  TTY_FLAGS="-it"
fi

run_in_container() {
  local command="$1"
  docker run --rm ${TTY_FLAGS} \
    -e PLAYWRIGHT_WORKERS="${PLAYWRIGHT_WORKERS}" \
    -e PLAYWRIGHT_TIMEOUT \
    -e PLAYWRIGHT_QUERY_EDITOR_TIMEOUT \
    -v "${PWD}":/work \
    -w /work \
    -u "$(id -u):$(id -g)" \
    "$IMAGE" \
    bash -lc "export HOME=/tmp && export VITE_BUG_REPORT_PROXY_URL=http://localhost:6173 && curl -fsSL https://install.duckdb.org | sh && export PATH=\"/tmp/.duckdb/cli/latest:$PATH\" && duckdb --version && corepack yarn install --immutable && corepack yarn ${command}"
}

case "$MODE" in
  test)
    run_in_container "test"
    ;;
  test-no-build)
    run_in_container "test:no-build"
    ;;
  build)
    run_in_container "build:test"
    ;;
  shell)
    docker run --rm ${TTY_FLAGS} \
      -v "${PWD}":/work \
      -w /work \
      -u "$(id -u):$(id -g)" \
      "$IMAGE" \
      bash
    ;;
  *)
    echo "Usage: $0 {test|test-no-build|build|shell}"
    exit 1
    ;;
esac
