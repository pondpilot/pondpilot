#!/bin/bash
set -e

# This script builds, signs, and notarizes the PondPilot macOS app

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting PondPilot macOS build and sign process...${NC}"

# Check for required environment variables
required_vars=("APPLE_ID" "APPLE_PASSWORD" "APPLE_TEAM_ID" "APPLE_SIGNING_IDENTITY")
missing_vars=()

for var in "${required_vars[@]}"; do
    if [[ -z "${!var}" ]]; then
        missing_vars+=("$var")
    fi
done

if [[ ${#missing_vars[@]} -ne 0 ]]; then
    echo -e "${RED}Error: Missing required environment variables:${NC}"
    printf '%s\n' "${missing_vars[@]}"
    echo -e "${YELLOW}Please set these in .env.local or export them before running this script.${NC}"
    exit 1
fi

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}Building PondPilot v${VERSION}...${NC}"

# Build the app
echo -e "${GREEN}Running Tauri build...${NC}"
yarn tauri build

# Path to the built app
APP_PATH="src-tauri/target/release/bundle/macos/PondPilot.app"
DMG_PATH="src-tauri/target/release/bundle/dmg/PondPilot_${VERSION}_x64.dmg"

# Verify the app was built
if [[ ! -d "$APP_PATH" ]]; then
    echo -e "${RED}Error: App bundle not found at $APP_PATH${NC}"
    exit 1
fi

# Sign the app with hardened runtime
echo -e "${GREEN}Signing app with identity: $APPLE_SIGNING_IDENTITY${NC}"
codesign --force --deep \
    --sign "$APPLE_SIGNING_IDENTITY" \
    --options runtime \
    --entitlements "src-tauri/entitlements.plist" \
    --timestamp \
    "$APP_PATH"

# Verify signing
echo -e "${GREEN}Verifying code signature...${NC}"
codesign -vvv --deep --strict "$APP_PATH"
if [[ $? -ne 0 ]]; then
    echo -e "${RED}Error: Code signing verification failed${NC}"
    exit 1
fi

# Check if DMG exists
if [[ ! -f "$DMG_PATH" ]]; then
    echo -e "${RED}Error: DMG not found at $DMG_PATH${NC}"
    exit 1
fi

# Notarize the DMG
echo -e "${GREEN}Submitting DMG for notarization...${NC}"
echo -e "${YELLOW}This may take several minutes...${NC}"

# Submit for notarization and capture the output
NOTARIZE_OUTPUT=$(xcrun notarytool submit "$DMG_PATH" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait 2>&1)

echo "$NOTARIZE_OUTPUT"

# Check if notarization was successful
if echo "$NOTARIZE_OUTPUT" | grep -q "status: Accepted"; then
    echo -e "${GREEN}Notarization successful!${NC}"
    
    # Staple the notarization ticket
    echo -e "${GREEN}Stapling notarization ticket...${NC}"
    xcrun stapler staple "$DMG_PATH"
    
    if [[ $? -eq 0 ]]; then
        echo -e "${GREEN}Successfully stapled notarization ticket${NC}"
    else
        echo -e "${RED}Warning: Failed to staple notarization ticket${NC}"
    fi
else
    echo -e "${RED}Error: Notarization failed${NC}"
    echo -e "${YELLOW}Check the output above for details${NC}"
    exit 1
fi

# Final verification
echo -e "${GREEN}Performing final verification...${NC}"
spctl -a -vvv -t install "$DMG_PATH"

echo -e "${GREEN}✅ Build, sign, and notarization complete!${NC}"
echo -e "${GREEN}DMG location: $DMG_PATH${NC}"