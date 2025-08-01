# macOS Code Signing and Notarization Setup for Tauri

## Prerequisites

1. **Apple Developer Account** ($99/year)
   - Sign up at https://developer.apple.com
   - Enroll in the Apple Developer Program

2. **Xcode** (latest version)
   - Install from Mac App Store
   - Open Xcode and accept license agreements

## Step 1: Create Certificates

### Developer ID Application Certificate (for distribution outside Mac App Store)

1. Open Xcode → Preferences → Accounts
2. Select your Apple ID → Manage Certificates
3. Click + → Developer ID Application
4. The certificate will be created and added to your keychain

### Alternative: Using Apple Developer Portal

1. Go to https://developer.apple.com/account/resources/certificates/list
2. Click + to create a new certificate
3. Select "Developer ID Application"
4. Follow the instructions to create a Certificate Signing Request (CSR)
5. Download and install the certificate

## Step 2: Configure Tauri for Code Signing

### Update tauri.conf.json

Add the macOS-specific configuration to your `tauri.conf.json`:

```json
{
  "tauri": {
    "bundle": {
      "active": true,
      "targets": "all",
      "identifier": "io.pondpilot.desktop",
      "icon": [...],
      "macOS": {
        "frameworks": [],
        "minimumSystemVersion": "10.15",
        "exceptionDomain": "",
        "signingIdentity": "-",
        "providerShortName": "YOUR_TEAM_ID",
        "entitlements": null
      }
    }
  }
}
```

### Create Entitlements File

Create `src-tauri/entitlements.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <false/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.files.downloads.read-write</key>
    <true/>
</dict>
</plist>
```

Update tauri.conf.json to reference it:

```json
"entitlements": "./entitlements.plist"
```

## Step 3: Set Up Environment Variables

### For Local Development

Create `.env.local` file in project root:

```bash
# Your Apple ID
APPLE_ID="your-email@example.com"

# App-specific password (create at https://appleid.apple.com/account/manage)
APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"

# Team ID (find in Apple Developer portal)
APPLE_TEAM_ID="XXXXXXXXXX"

# Certificate identity (use "Developer ID Application: Your Name (TEAMID)")
APPLE_SIGNING_IDENTITY="Developer ID Application: Your Company (XXXXXXXXXX)"

# Provider short name (usually same as Team ID)
APPLE_PROVIDER_SHORT_NAME="XXXXXXXXXX"
```

### For GitHub Actions

Add these as repository secrets:
- `APPLE_CERTIFICATE` - Base64 encoded .p12 certificate
- `APPLE_CERTIFICATE_PASSWORD` - Password for the certificate
- `APPLE_ID` - Your Apple ID
- `APPLE_PASSWORD` - App-specific password
- `APPLE_TEAM_ID` - Your Team ID

## Step 4: Export Certificate for CI/CD

1. Open Keychain Access
2. Find your "Developer ID Application" certificate
3. Right-click → Export
4. Save as .p12 with a password
5. Convert to base64:
   ```bash
   base64 -i certificate.p12 | pbcopy
   ```
6. Add to GitHub secrets

## Step 5: Create Build Script

Create `scripts/build-and-sign.sh`:

```bash
#!/bin/bash
set -e

# Load environment variables
source .env.local

# Build the app
yarn tauri build

# Sign the app
APP_PATH="src-tauri/target/release/bundle/macos/PondPilot.app"

# Sign with hardened runtime
codesign --force --deep --sign "$APPLE_SIGNING_IDENTITY" \
  --options runtime \
  --entitlements "src-tauri/entitlements.plist" \
  "$APP_PATH"

# Verify signing
codesign -vvv --deep --strict "$APP_PATH"

# Create DMG
DMG_PATH="src-tauri/target/release/bundle/dmg/PondPilot_${VERSION}_x64.dmg"

# Notarize
echo "Notarizing app..."
xcrun notarytool submit "$DMG_PATH" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

# Staple the notarization
xcrun stapler staple "$DMG_PATH"

echo "Build, sign, and notarization complete!"
```

## Step 6: GitHub Actions Workflow

Create `.github/workflows/build-release.yml`:

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        
      - name: Install dependencies
        run: yarn install
        
      - name: Import Apple Certificate
        env:
          CERTIFICATE_BASE64: ${{ secrets.APPLE_CERTIFICATE }}
          CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
        run: |
          # Create temporary keychain
          KEYCHAIN_PATH=$RUNNER_TEMP/app-signing.keychain-db
          KEYCHAIN_PASSWORD=$(openssl rand -base64 32)
          
          # Create keychain
          security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
          security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
          security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
          
          # Import certificate
          echo "$CERTIFICATE_BASE64" | base64 --decode > certificate.p12
          security import certificate.p12 -P "$CERTIFICATE_PASSWORD" \
            -A -t cert -f pkcs12 -k "$KEYCHAIN_PATH"
          security list-keychain -d user -s "$KEYCHAIN_PATH"
          
          # Allow codesign to access keychain
          security set-key-partition-list -S apple-tool:,apple:,codesign: \
            -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
            
      - name: Build Tauri App
        env:
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: |
          yarn tauri build
          
      - name: Notarize app
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: |
          DMG_PATH=$(find src-tauri/target/release/bundle/dmg -name "*.dmg")
          
          # Submit for notarization
          xcrun notarytool submit "$DMG_PATH" \
            --apple-id "$APPLE_ID" \
            --password "$APPLE_PASSWORD" \
            --team-id "$APPLE_TEAM_ID" \
            --wait
            
          # Staple the notarization
          xcrun stapler staple "$DMG_PATH"
          
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: macos-dmg
          path: src-tauri/target/release/bundle/dmg/*.dmg
```

## Step 7: Testing

### Local Testing

1. Run the build script:
   ```bash
   chmod +x scripts/build-and-sign.sh
   ./scripts/build-and-sign.sh
   ```

2. Verify signing:
   ```bash
   codesign -vvv --deep --strict src-tauri/target/release/bundle/macos/PondPilot.app
   spctl -a -vvv -t install src-tauri/target/release/bundle/dmg/PondPilot_*.dmg
   ```

### Common Issues

1. **"errSecInternalComponent" error**: Keychain is locked or certificate not trusted
   - Solution: Unlock keychain, set certificate to "Always Trust"

2. **Notarization fails**: Check that all libraries and frameworks are signed
   - Solution: Use `--deep` flag with codesign

3. **"unnotarized developer" warning**: Notarization not complete
   - Solution: Wait for notarization to finish, then staple

## Additional Resources

- [Tauri macOS Code Signing Guide](https://tauri.app/v1/guides/distribution/sign-macos)
- [Apple Notarization Documentation](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Notarytool Documentation](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution/customizing_the_notarization_workflow)