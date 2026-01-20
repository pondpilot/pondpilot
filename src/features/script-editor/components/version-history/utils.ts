import { ScriptVersion, ScriptVersionGroup } from '@models/script-version';

/**
 * Formats a date as a relative or absolute date string for version history headers.
 * Returns "Today", "Yesterday", or a formatted date string for older dates.
 */
export const formatDateHeader = (date: Date): string => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) {
    return 'Today';
  }

  if (isYesterday) {
    return 'Yesterday';
  }

  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

/**
 * Groups versions by date, sorted with most recent first.
 */
export const groupVersionsByDate = (versions: ScriptVersion[]): ScriptVersionGroup[] => {
  const groups = new Map<string, ScriptVersion[]>();

  versions.forEach((version) => {
    const date = new Date(version.timestamp);
    const dateKey = date.toDateString();

    if (!groups.has(dateKey)) {
      groups.set(dateKey, []);
    }
    groups.get(dateKey)!.push(version);
  });

  return Array.from(groups.entries())
    .map(([dateKey, versionList]) => ({
      date: new Date(dateKey),
      versions: versionList.sort((a, b) => b.timestamp - a.timestamp),
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
};
