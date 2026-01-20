/**
 * Date formatting utilities for consistent date/time display across the application
 */

/**
 * Formats a date object to a full date string
 * @param date The date to format
 * @returns Formatted date string like "Monday, January 1, 2024"
 */
export const formatDate = (date: Date): string => {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

/**
 * Formats a timestamp to a time string
 * @param timestamp The timestamp to format
 * @returns Formatted time string like "3:30 PM"
 */
export const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * Formats a timestamp to a full date/time string
 * @param timestamp The timestamp to format
 * @returns Formatted date/time string like "Mon, Jan 1, 2024, 3:30 PM"
 */
export const formatDateTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Formats a timestamp to a compact relative time string (e.g., "5m ago")
 * For times older than 7 days, returns an absolute date string
 * @param timestamp The timestamp to format
 * @returns Relative time string like "5m ago" or absolute date like "Jan 15"
 */
export const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < MINUTE) {
    return 'Just now';
  }

  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE);
    return `${minutes}m ago`;
  }

  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours}h ago`;
  }

  if (diff < WEEK) {
    const days = Math.floor(diff / DAY);
    return `${days}d ago`;
  }

  // Older than 7 days - show compact absolute date
  const date = new Date(timestamp);
  const currentYear = new Date().getFullYear();
  const dateYear = date.getFullYear();

  // Only show year if different from current year
  if (dateYear === currentYear) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};
