import { DBPersistenceState } from '@models/db-persistence';

/**
 * Format a file size in bytes to a human-readable string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${parseFloat((bytes / 1024 ** i).toFixed(2))} ${sizes[i]}`;
}

/**
 * Generate a database file path with a timestamp
 */
export function generateDBExportFileName(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return `pondpilot-db-${timestamp}.db`;
}

/**
 * Create a download for a database file
 */
export function downloadDatabaseFile(data: ArrayBuffer, fileName: string): void {
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';

  document.body.appendChild(a);
  a.click();

  // Clean up
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Check if persistence is supported in the current browser
 */
export function isPersistenceSupported(): boolean {
  // In Tauri, persistence is handled differently
  if (typeof window !== 'undefined' && '__TAURI__' in window) {
    return true;
  }

  return (
    'navigator' in window &&
    'storage' in navigator &&
    'getDirectory' in navigator.storage &&
    'FileSystemDirectoryHandle' in window
  );
}

/**
 * Get the persistence state representation for display
 */
export function getPersistenceStateText(state: DBPersistenceState): string {
  if (!state.lastSync) {
    return 'Not yet saved';
  }

  const timeAgo = getTimeAgo(state.lastSync);
  return `Last saved ${timeAgo}`;
}

/**
 * Format a date as a human-readable "time ago" string
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;

  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}
