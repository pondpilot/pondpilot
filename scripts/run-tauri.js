#!/usr/bin/env node

/**
 * Ensures tauri CLI always sees the environment variables required for Linux AppImage bundling.
 * We inject the vars only on Linux so macOS/Windows builds keep working without extra tooling.
 */
const { spawn } = require('node:child_process');

const args = process.argv.slice(2);
const env = { ...process.env };

if (process.platform === 'linux') {
  if (!env.APPIMAGE_EXTRACT_AND_RUN) {
    env.APPIMAGE_EXTRACT_AND_RUN = '1';
  }
  if (!env.NO_STRIP) {
    env.NO_STRIP = '1';
  }
}

const tauriBinary = process.platform === 'win32' ? 'tauri.exe' : 'tauri';
const child = spawn(tauriBinary, args, {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
