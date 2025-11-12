# Import the user's Justfile if it exists
import? '~/.justfile'
import? '~/justfile'

# Show the list of available commands
default:
    just --list

docker-build base_path='/':
	#!/usr/bin/env bash
	set -euo pipefail
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

# Run Tauri development server
tauri-dev:
    yarn tauri dev

# Build Tauri release version
tauri-build:
    yarn tauri build

# Build Tauri for macOS (ARM64 only)
tauri-build-mac:
    @echo "Building Tauri app for macOS (ARM64)..."
    cd src-tauri && cargo build --release
    yarn tauri build --target aarch64-apple-darwin

# Create zip archive for notarization (Tauri handles signing with config)
tauri-package-mac: tauri-build-mac
    @echo "Verifying signature..."
    codesign -dv --verbose=4 src-tauri/target/aarch64-apple-darwin/release/bundle/macos/PondPilot.app
    @echo "Creating zip archive for notarization..."
    cd src-tauri/target/aarch64-apple-darwin/release/bundle/macos && zip -r PondPilot.zip PondPilot.app
    @echo "Archive created at src-tauri/target/aarch64-apple-darwin/release/bundle/macos/PondPilot.zip"

# Submit for notarization
tauri-notarize-mac PROFILE_NAME="notarytool-kefir": tauri-package-mac
    @echo "Submitting for notarization..."
    xcrun notarytool submit src-tauri/target/aarch64-apple-darwin/release/bundle/macos/PondPilot.zip \
        --keychain-profile "{{PROFILE_NAME}}" \
        --wait

# Staple notarization to the app
tauri-staple-mac: tauri-notarize-mac
    @echo "Stapling notarization ticket to app..."
    cd src-tauri/target/aarch64-apple-darwin/release/bundle/macos && unzip -o PondPilot.zip
    xcrun stapler staple src-tauri/target/aarch64-apple-darwin/release/bundle/macos/PondPilot.app
    @echo "Creating final distribution DMG..."
    mkdir -p src-tauri/target/aarch64-apple-darwin/release/bundle/dmg
    hdiutil create -volname "PondPilot" -srcfolder src-tauri/target/aarch64-apple-darwin/release/bundle/macos/PondPilot.app -ov -format UDZO src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/PondPilot.dmg

# Check notarization status
tauri-check-notarization SUBMISSION_ID:
    xcrun notarytool info {{SUBMISSION_ID}} \
        --keychain-profile "notarytool-kefir"

# Get notarization log
tauri-notarization-log SUBMISSION_ID:
    xcrun notarytool log {{SUBMISSION_ID}} \
        --keychain-profile "notarytool-kefir"

# Full release flow for macOS
tauri-release-mac: tauri-staple-mac
    @echo "Release build complete!"
    @echo "Notarized app available at: src-tauri/target/aarch64-apple-darwin/release/bundle/macos/PondPilot.app"
    @echo "DMG available at: src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/PondPilot.dmg"

# Clean Tauri build artifacts
tauri-clean:
    cd src-tauri && cargo clean
    rm -rf src-tauri/target/aarch64-apple-darwin/release/bundle/macos/PondPilot.zip

# Download duckdb wasm EH modules and sheetjs xlsx module to a cache directory.
# This directory is gitignored and is used by test fixtures to bypass loading
# big modules from internet when cache is available.
# Usage: just cache-online-modules [version]
# If version is not provided, it will be extracted from package.json
cache-online-modules *args='':
    #!/usr/bin/env bash
    # Define the cache directory
    CACHE_DIR=".module-cache"

    if [ -z "{{args}}" ]; then
      # Extract version from package.json if not provided
      version=$(node -e "console.log(require('./package.json').dependencies['@duckdb/duckdb-wasm'])")
      echo "Using DuckDB version $version from package.json"
    else
      version="{{args}}"
      echo "Using user-specified DuckDB version: $version"
    fi

    # Create directories if they don't exist
    mkdir -p "$CACHE_DIR"

    # Define DuckDB files to download with separate URL and destination variables
    declare -a urls=(
      "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@$version/dist/duckdb-eh.wasm"
      "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@$version/dist/duckdb-browser-eh.worker.js"
      "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@$version/dist/duckdb-eh.wasm.js"
    )
    declare -a destinations=(
      "$CACHE_DIR/duckdb-eh.wasm"
      "$CACHE_DIR/duckdb-browser-eh.worker.js"
      "$CACHE_DIR/duckdb-eh.wasm.js"
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
    xlsx_dest="$CACHE_DIR/xlsx.full.min.js"

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

    echo "All required modules are available in the $CACHE_DIR folder."
