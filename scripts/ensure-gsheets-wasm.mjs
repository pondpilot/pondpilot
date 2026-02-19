import { spawn } from 'node:child_process';
import { constants as fsConstants, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const artifactName = 'gsheets.duckdb_extension.wasm';
const sourceFromEnv = process.env.GSHEETS_WASM_SOURCE;
const sourceRepo = path.resolve(
  process.env.GSHEETS_EXTENSION_REPO ?? path.join(projectRoot, '..', 'duckdb_gsheets'),
);
const forceRebuild = (process.env.GSHEETS_WASM_FORCE_REBUILD ?? '').toLowerCase() === 'true';

const destination = path.join(projectRoot, 'public', 'duckdb-extensions', 'gsheets', artifactName);
const preferredBuildArtifact = path.join(
  sourceRepo,
  'build',
  'wasm_eh',
  'extension',
  'gsheets',
  artifactName,
);

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function getLatestMtime(targetPath) {
  const stats = await fs.stat(targetPath);
  let latest = stats.mtimeMs;
  if (!stats.isDirectory()) {
    return latest;
  }
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(targetPath, entry.name);
    const entryLatest = await getLatestMtime(entryPath);
    if (entryLatest > latest) {
      latest = entryLatest;
    }
  }
  return latest;
}

async function getSourceLatestMtime(repoPath) {
  const candidates = [
    path.join(repoPath, 'CMakeLists.txt'),
    path.join(repoPath, 'extension_config.cmake'),
    path.join(repoPath, 'src'),
  ];
  let latest = 0;
  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) {
      continue;
    }
    const candidateLatest = await getLatestMtime(candidate);
    if (candidateLatest > latest) {
      latest = candidateLatest;
    }
  }
  return latest;
}

async function findArtifact(repoPath) {
  if (await pathExists(preferredBuildArtifact)) {
    return preferredBuildArtifact;
  }
  const fallbackRoot = path.join(repoPath, 'build', 'wasm_eh', 'repository');
  if (!(await pathExists(fallbackRoot))) {
    return null;
  }
  const stack = [fallbackRoot];
  while (stack.length) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.name === artifactName) {
        return entryPath;
      }
    }
  }
  return null;
}

function normalizePath(value) {
  return value.replaceAll('\\', '/');
}

async function clearStaleBuildCache(repoPath) {
  const cachePath = path.join(repoPath, 'build', 'wasm_eh', 'CMakeCache.txt');
  if (!(await pathExists(cachePath))) {
    return;
  }

  const cache = await fs.readFile(cachePath, 'utf8');
  const normalizedRepoPath = normalizePath(repoPath);
  if (cache.includes(normalizedRepoPath)) {
    return;
  }

  await fs.rm(path.join(repoPath, 'build', 'wasm_eh'), { force: true, recursive: true });
  console.log(`Removed stale gsheets wasm build cache at ${cachePath}`);
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`));
    });
  });
}

async function resolveEmsdkEnvScript() {
  const emsdkCandidates = [
    process.env.EMSDK,
    path.join(os.homedir(), 'Developer', 'emsdk'),
    path.resolve(projectRoot, '..', '..', '..', 'emsdk'),
  ].filter(Boolean);

  for (const candidate of emsdkCandidates) {
    const scriptPath = path.join(candidate, 'emsdk_env.sh');
    if (await pathExists(scriptPath)) {
      return scriptPath;
    }
  }
  return null;
}

async function buildWasm(repoPath) {
  await clearStaleBuildCache(repoPath);

  const customBuildCommand = process.env.GSHEETS_WASM_BUILD_COMMAND?.trim();
  if (customBuildCommand) {
    await runCommand('bash', ['-lc', customBuildCommand], repoPath);
    return;
  }

  const emsdkEnvScript = await resolveEmsdkEnvScript();
  if (emsdkEnvScript) {
    await runCommand(
      'bash',
      ['-lc', `source ${shellQuote(emsdkEnvScript)} && make wasm_eh`],
      repoPath,
    );
    return;
  }

  await runCommand('make', ['wasm_eh'], repoPath);
}

async function copyIfNeeded(sourcePath, destinationPath) {
  let shouldCopy = true;
  if (await pathExists(destinationPath)) {
    const [sourceStats, destinationStats] = await Promise.all([
      fs.stat(sourcePath),
      fs.stat(destinationPath),
    ]);
    shouldCopy =
      destinationStats.mtimeMs < sourceStats.mtimeMs || destinationStats.size !== sourceStats.size;
  }

  if (!shouldCopy) {
    console.log(`gsheets wasm is up to date: ${destinationPath}`);
    return;
  }

  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
  console.log(`Copied gsheets wasm from ${sourcePath} to ${destinationPath}`);
}

async function main() {
  if (sourceFromEnv) {
    if (!(await pathExists(sourceFromEnv))) {
      throw new Error(`GSHEETS_WASM_SOURCE does not exist: ${sourceFromEnv}`);
    }
    await copyIfNeeded(sourceFromEnv, destination);
    return;
  }

  if (!(await pathExists(sourceRepo))) {
    if (await pathExists(destination)) {
      console.log(`gsheets fork not found; using existing bundled wasm: ${destination}`);
      return;
    }
    console.warn(`gsheets fork not found at ${sourceRepo}; skipping wasm build.`);
    return;
  }

  const sourceLatestMtime = await getSourceLatestMtime(sourceRepo);
  let artifactPath = await findArtifact(sourceRepo);
  let artifactMtime = 0;
  if (artifactPath) {
    artifactMtime = (await fs.stat(artifactPath)).mtimeMs;
  }

  if (forceRebuild || !artifactPath || artifactMtime < sourceLatestMtime) {
    console.log(`Building gsheets wasm from ${sourceRepo}...`);
    await buildWasm(sourceRepo);
    artifactPath = await findArtifact(sourceRepo);
    if (!artifactPath) {
      throw new Error(`Unable to locate ${artifactName} after build in ${sourceRepo}`);
    }
  }

  await copyIfNeeded(artifactPath, destination);
}

main().catch((error) => {
  console.error('Failed to ensure gsheets wasm extension:', error);
  process.exit(1);
});
