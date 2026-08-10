#!/usr/bin/env bash
set -euo pipefail

IMAGE="mcr.microsoft.com/playwright:v1.62.1-noble"
DUCKDB_VERSION="v1.5.2"
MODE="${1:-test}"
PLAYWRIGHT_WORKERS=1
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
    -e PONDPILOT_TEST_COMMAND="${command}" \
    -e DUCKDB_VERSION="${DUCKDB_VERSION}" \
    -e VITE_BUG_REPORT_PROXY_URL=http://localhost:6173 \
    -v "${PWD}":/work \
    -w /work \
    -u "$(id -u):$(id -g)" \
    "$IMAGE" \
    bash -lc '
      set -euo pipefail
      case "$(uname -m)" in
        x86_64|amd64) duckdb_platform=linux-amd64 ;;
        aarch64|arm64) duckdb_platform=linux-arm64 ;;
        *) echo "Unsupported Docker architecture: $(uname -m)" >&2; exit 1 ;;
      esac
      mkdir -p /tmp/pondpilot-bin /tmp/pondpilot-corepack /tmp/pondpilot-yarn
      curl -fsSL \
        "https://install.duckdb.org/${DUCKDB_VERSION}/duckdb_cli-${duckdb_platform}.gz" \
        -o /tmp/pondpilot-duckdb.gz
      gzip -dc /tmp/pondpilot-duckdb.gz > /tmp/pondpilot-bin/duckdb
      chmod +x /tmp/pondpilot-bin/duckdb
      /tmp/pondpilot-bin/duckdb --version
      COREPACK_HOME=/tmp/pondpilot-corepack YARN_GLOBAL_FOLDER=/tmp/pondpilot-yarn \
        corepack yarn install --immutable
      PATH="/tmp/pondpilot-bin:${PATH}" COREPACK_HOME=/tmp/pondpilot-corepack \
        YARN_GLOBAL_FOLDER=/tmp/pondpilot-yarn \
        corepack yarn ${PONDPILOT_TEST_COMMAND}
    '
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
