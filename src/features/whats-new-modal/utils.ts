export const normalizeChangelogLinks = (text: string): string => {
  return text.replace(
    /\*\*(.+?)\*\*:\s*(https?:\/\/\S+)/g,
    (match, label, url) => `**[${label}](${url})**`,
  );
};
