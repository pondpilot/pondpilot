const minimumMajor = 24;
const currentVersion = process.versions.node;
const currentMajor = Number(currentVersion.split('.')[0]);

// CI pins the exact version from .node-version; local runs only need a
// compatible major so newer Node releases keep working.
if (currentMajor < minimumMajor) {
  console.error(
    `PondPilot requires Node.js ${minimumMajor} or newer. Current version: ${currentVersion}. ` +
      'Install the version from .node-version before running builds or tests.',
  );
  process.exit(1);
}
