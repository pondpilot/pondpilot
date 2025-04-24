# Import the user's Justfile if it exists
import? '~/.justfile'
import? '~/justfile'

# Show the list of available commands
default:
    just --list

docker-build:
    corepack enable
    yarn install --immutable
    yarn build
    docker build -t pondpilot:latest -f docker/Dockerfile .

docker-run:
    docker run -d -p 4173:80 --name pondpilot pondpilot:latest

docker-stop:
    docker stop pondpilot

check-and-fix:
    yarn typecheck
    yarn lint:fix
    yarn prettier:write

# Download duckdb wasm EH modules and sheetjs xlsx module to dist/static folder
# Usage: just download-duckdb-modules [version]
# If version is not provided, it will be extracted from package.json
cache-online-modules *args='':
    #!/usr/bin/env bash
    if [ -z "{{args}}" ]; then
      # Extract version from package.json if not provided
      version=$(node -e "console.log(require('./package.json').dependencies['@duckdb/duckdb-wasm'])")
      echo "Using DuckDB version $version from package.json"
    else
      version="{{args}}"
      echo "Using user-specified DuckDB version: $version"
    fi
    
    # Create directories if they don't exist
    mkdir -p dist/static
    
    # Define DuckDB files to download with separate URL and destination variables
    declare -a urls=(
      "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@$version/dist/duckdb-eh.wasm"
      "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@$version/dist/duckdb-browser-eh.worker.js"
      "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@$version/dist/duckdb-eh.wasm.js"
    )
    declare -a destinations=(
      "dist/static/duckdb-eh.wasm"
      "dist/static/duckdb-browser-eh.worker.js"
      "dist/static/duckdb-eh.wasm.js"
    )
    
    # Download DuckDB WASM modules if they don't exist
    for i in "${!urls[@]}"; do
      url="${urls[$i]}"
      dest="${destinations[$i]}"
      
      if [ -f "$dest" ]; then
        echo "File $dest already exists, skipping download"
      else
        echo "Downloading $url to $dest"
        curl -L "$url" -o "$dest"
      fi
    done
    
    # Extract SheetJS URL from package.json and download it if it doesn't exist
    xlsx_url=$(node -e "console.log(require('./package.json').dependencies.xlsx)")
    xlsx_dest="dist/static/xlsx.full.min.js"
    
    if [ -f "$xlsx_dest" ]; then
      echo "SheetJS xlsx module already exists at $xlsx_dest, skipping download"
    else
      echo "Downloading SheetJS xlsx module from $xlsx_url..."
      temp_dir=$(mktemp -d)
      curl -L "$xlsx_url" -o "$temp_dir/xlsx.tgz"
      tar -xzf "$temp_dir/xlsx.tgz" -C "$temp_dir"
      cp "$temp_dir/package/dist/xlsx.full.min.js" "$xlsx_dest"
      rm -rf "$temp_dir"
    fi
    
    echo "All required modules are available in the dist/static folder."
