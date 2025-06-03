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
