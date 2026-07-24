import { showWarning } from '@components/app-notifications';

type DiscardedRestoreEntry = {
  entry: {
    kind: 'file' | 'directory';
    name: string;
  };
  type: 'denied' | 'removed' | 'error' | 'warning';
  reason: string;
};

export function reportRestoreIssues(
  discardedEntries: DiscardedRestoreEntry[],
  warnings: string[],
): void {
  if (warnings.length) {
    showWarning({
      title: 'Initialization Warnings',
      message: warnings.join('\n'),
    });
  }

  if (!discardedEntries.length) {
    return;
  }

  const { totalErrors, totalDenied, totalRemoved } = discardedEntries.reduce(
    (acc, entry) => {
      const what = entry.entry.kind === 'file' ? 'File' : 'Directory';
      switch (entry.type) {
        case 'removed':
          console.warn(`${what} '${entry.entry.name}' was removed from disk.`);
          acc.totalRemoved += 1;
          break;
        case 'error':
          console.error(`${what} '${entry.entry.name}' handle couldn't be read: ${entry.reason}.`);
          acc.totalErrors += 1;
          break;
        case 'denied':
        default:
          console.warn(`${what} '${entry.entry.name}' handle permission was denied by user.`);
          acc.totalDenied += 1;
          break;
      }
      return acc;
    },
    { totalErrors: 0, totalDenied: 0, totalRemoved: 0 },
  );

  const totalDiscarded = totalErrors + totalDenied + totalRemoved;
  showWarning({
    title: 'Some files unavailable',
    message: `A total of ${totalDiscarded} file handles were discarded.
          ${totalErrors} couldn't be read, ${totalDenied} were denied by user, and
          ${totalRemoved} were removed from disk.`,
  });
}
