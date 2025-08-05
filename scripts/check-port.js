#!/usr/bin/env node

const net = require('net');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEFAULT_PORT = 5174;
const MAX_PORT_ATTEMPTS = 10;

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
  const isAvailable = await isPortAvailable(DEFAULT_PORT);
  
  if (!isAvailable) {
    console.warn(`⚠️  Port ${DEFAULT_PORT} is already in use`);
    
    const processInfo = getProcessUsingPort(DEFAULT_PORT);
    if (processInfo) {
      console.warn(`   Process: ${processInfo.command} (PID: ${processInfo.pid}, User: ${processInfo.user})`);
    }
    
    const newPort = await findAvailablePort(DEFAULT_PORT);
    console.log(`✅ Found available port: ${newPort}`);
    
    // Update tauri.conf.json
    const tauriConfigPath = path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
    const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));
    tauriConfig.build.devUrl = `http://localhost:${newPort}`;
    fs.writeFileSync(tauriConfigPath, JSON.stringify(tauriConfig, null, 2));
    console.log(`✅ Updated tauri.conf.json with new port`);
    
    // Create/update .env.local to set Vite port
    const envPath = path.join(__dirname, '..', '.env.local');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      // Remove existing VITE_PORT if present
      envContent = envContent.split('\n')
        .filter(line => !line.startsWith('VITE_PORT='))
        .join('\n');
    }
    envContent = envContent.trim() + `\nVITE_PORT=${newPort}\n`;
    fs.writeFileSync(envPath, envContent);
    console.log(`✅ Updated .env.local with VITE_PORT=${newPort}`);
    
    process.env.VITE_PORT = newPort;
  } else {
    console.log(`✅ Port ${DEFAULT_PORT} is available`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { findAvailablePort, isPortAvailable };