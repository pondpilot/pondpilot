# Import the user's Justfile if it exists
import? '~/.justfile'
import? '~/justfile'

# Show the list of available commands
default:
    just --list

docker-build base_path='/':
  #!/usr/bin/env sh
  # Validate and normalize base_path
  if [[ "{{base_path}}" != /* ]]; then
    echo "Base path must start with a slash. Prepending automatically." >&2
    base_path="/{{base_path}}"
  else
    base_path="{{base_path}}"
  fi
  if [[ "$base_path" != */ ]]; then
    echo "Base path must end with a slash. Appending automatically." >&2
    base_path="${base_path}/"
  fi
  echo "Using base path: $base_path"
  corepack enable
  yarn install --immutable
  DOCKER_BUILD=true VITE_BASE_PATH=$base_path yarn build
  docker build -t pondpilot:latest -f docker/Dockerfile --load .

docker-run:
    docker run --rm -d -p 4173:80 --name pondpilot pondpilot:latest

docker-stop:
    docker stop pondpilot

check-and-fix:
    yarn typecheck
    yarn lint:fix
    yarn prettier:write

# Download and checksum-verify the exact DuckDB-WASM modules and extensions used by tests.
cache-online-modules:
    yarn cache:test-modules
