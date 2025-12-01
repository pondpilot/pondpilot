macOS Entitlements Audit

Summary
This document explains the macOS entitlements used by PondPilot Desktop and provides guidance for potential hardening.

Current entitlements (src-tauri/entitlements.plist)
- com.apple.security.app-sandbox: false
  - Not using App Sandbox. Tauri apps typically ship hardened runtime without sandboxing; enabling the sandbox requires deeper changes (file system access via security-scoped bookmarks, etc.).

- com.apple.security.files.user-selected.read-write: true
  - Required to access user-selected files and directories.

- com.apple.security.network.client: true
  - Required for outgoing network connections (e.g., extensions, remote datasets, AI providers).

- com.apple.security.files.downloads.read-write: true
  - Convenience entitlement to access the Downloads folder. Could be removed if we only access files via user-selection.

- com.apple.security.cs.allow-jit: true
  - Allows JIT compilation. Recommended for webview performance (JavaScriptCore/WebKit). Common for Tauri apps.

- com.apple.security.cs.disable-library-validation: true
  - Allows loading external libraries. May be required for some plugin/extension configurations. Evaluate if strictly needed.

- com.apple.security.cs.allow-unsigned-executable-memory: true
  - Permits allocating unsigned executable memory. Typically not required when allow-jit is enabled; consider removing if app functions without it.

- com.apple.security.cs.disable-executable-page-protection: true
  - Disables certain executable page protections. This is stronger than needed for typical Tauri apps. Recommend testing removal.

Recommendations
1) Keep allow-jit enabled for WebKit JIT performance.
2) Evaluate necessity of disable-library-validation for your plugin/extension usage; remove if possible.
3) Attempt to remove allow-unsigned-executable-memory and disable-executable-page-protection; validate build + runtime thoroughly.
4) Consider removing Downloads folder entitlement if all access is user-selected via dialogs.
5) Long-term: explore App Sandbox adoption if distribution constraints require it, but this impacts file access architecture.

Testing Plan
- Build and run with the following removals one by one:
  a) com.apple.security.cs.allow-unsigned-executable-memory
  b) com.apple.security.cs.disable-executable-page-protection
  c) com.apple.security.files.downloads.read-write
- Verify startup, secrets manager, database attach, file import/export, and streaming.

