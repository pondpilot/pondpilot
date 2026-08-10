const requiredMajor = 24;
const currentVersion = process.versions.node;
const currentMajor = Number(currentVersion.split('.')[0]);

if (currentMajor !== requiredMajor) {
  console.error(
    `PondPilot requires Node.js ${requiredMajor}.x. Current version: ${currentVersion}. ` +
      'Install the version from .node-version before running builds or tests.',
  );
  process.exit(1);
}
