#!/usr/bin/env node

const net = require('net');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEFAULT_PORT = 5173;
const MAX_PORT_ATTEMPTS = 10;
const ROOT_DIR = path.join(__dirname, '..');
const TAURI_CONFIG_PATH = path.join(ROOT_DIR, 'src-tauri', 'tauri.conf.json');
const ENV_LOCAL_PATH = path.join(ROOT_DIR, '.env.local');
const ENV_PATH = path.join(ROOT_DIR, '.env');

function parsePort(value) {
  if (!value) {
    return null;
  }

  const sanitized = value
    .split('#')[0] // Drop inline comments
    .trim()
    .replace(/^['"]|['"]$/g, '');

  const port = Number.parseInt(sanitized, 10);
  if (Number.isInteger(port) && port > 0 && port <= 65535) {
    return port;
  }
  return null;
}

function readPortFromEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^VITE_PORT\s*=\s*(.+)$/m);
  return match ? parsePort(match[1]) : null;
}

function getPortFromTauriConfig() {
  if (!fs.existsSync(TAURI_CONFIG_PATH)) {
    return null;
  }
  try {
    const config = JSON.parse(fs.readFileSync(TAURI_CONFIG_PATH, 'utf8'));
    const devUrl = config?.build?.devUrl;
    if (typeof devUrl !== 'string') {
      return null;
    }
    try {
      const parsed = new URL(devUrl);
      if (parsed.port) {
        return parsePort(parsed.port);
      }
      return parsed.protocol === 'https:' ? 443 : 80;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

function resolveBasePort() {
  return (
    parsePort(process.env.VITE_PORT) ??
    readPortFromEnvFile(ENV_LOCAL_PATH) ??
    readPortFromEnvFile(ENV_PATH) ??
    getPortFromTauriConfig() ??
    DEFAULT_PORT
  );
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(startPort) {
  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`Could not find an available port after ${MAX_PORT_ATTEMPTS} attempts`);
}

function getProcessUsingPort(port) {
  try {
    const output = execSync(`lsof -i :${port} -P -n | grep LISTEN || true`, { encoding: 'utf8' });
    if (output) {
      const lines = output.trim().split('\n');
      if (lines.length > 0) {
        const parts = lines[0].split(/\s+/);
        return {
          command: parts[0],
          pid: parts[1],
          user: parts[2]
        };
      }
    }
  } catch (error) {
    // Ignore errors
  }
  return null;
}

async function main() {
  const basePort = resolveBasePort();
  const isAvailable = await isPortAvailable(basePort);
  
  if (!isAvailable) {
    console.warn(`⚠️  Port ${basePort} is already in use`);
    
    const processInfo = getProcessUsingPort(basePort);
    if (processInfo) {
      console.warn(`   Process: ${processInfo.command} (PID: ${processInfo.pid}, User: ${processInfo.user})`);
    }
    
    const newPort = await findAvailablePort(basePort);
    console.log(`✅ Found available port: ${newPort}`);
    
    // Update tauri.conf.json
    if (fs.existsSync(TAURI_CONFIG_PATH)) {
      const tauriConfig = JSON.parse(fs.readFileSync(TAURI_CONFIG_PATH, 'utf8'));
      tauriConfig.build = tauriConfig.build || {};
      tauriConfig.build.devUrl = `http://localhost:${newPort}`;
      fs.writeFileSync(TAURI_CONFIG_PATH, JSON.stringify(tauriConfig, null, 2));
      console.log(`✅ Updated tauri.conf.json with new port`);
    }
    
    // Create/update .env.local to set Vite port
    const envPath = ENV_LOCAL_PATH;
    let envLines = [];
    if (fs.existsSync(envPath)) {
      envLines = fs
        .readFileSync(envPath, 'utf8')
        .split('\n')
        .filter((line) => {
          const trimmed = line.trim();
          return trimmed.length === 0 || !trimmed.startsWith('VITE_PORT=');
        });
    }
    envLines.push(`VITE_PORT=${newPort}`);
    fs.writeFileSync(envPath, `${envLines.join('\n')}\n`);
    console.log(`✅ Updated .env.local with VITE_PORT=${newPort}`);
    
    process.env.VITE_PORT = String(newPort);
  } else {
    console.log(`✅ Port ${basePort} is available`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { findAvailablePort, isPortAvailable };
