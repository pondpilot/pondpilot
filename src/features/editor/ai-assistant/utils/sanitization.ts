/**
 * Sanitization utilities for AI Assistant
 */

/**
 * Sanitizes text content for safe insertion into the DOM
 * @param text - The text to sanitize
 * @returns Sanitized text safe for DOM insertion
 */
export function sanitizeText(text: string): string {
  // Basic HTML entity encoding for safety
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitizes content for localStorage storage
 * Removes potential XSS vectors while preserving structure
 * @param content - The content to sanitize
 * @returns Sanitized content safe for storage
 */
export function sanitizeForStorage(content: string): string {
  // Remove any script tags or event handlers
  return content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '');
}

/**
 * Calculates the approximate memory size of an object in bytes
 * @param obj - The object to measure
 * @returns Approximate size in bytes
 */
export function getObjectSizeInBytes(obj: any): number {
  const objectList: any[] = [];
  const stack = [obj];
  let bytes = 0;

  while (stack.length) {
    const value = stack.pop();

    if (typeof value === 'boolean') {
      bytes += 4;
    } else if (typeof value === 'string') {
      bytes += value.length * 2;
    } else if (typeof value === 'number') {
      bytes += 8;
    } else if (typeof value === 'object' && value !== null && !objectList.includes(value)) {
      objectList.push(value);
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          bytes += key.length * 2;
          stack.push(value[key]);
        }
      }
    }
  }

  return bytes;
}

/**
 * Converts bytes to megabytes
 * @param bytes - Size in bytes
 * @returns Size in MB
 */
export function bytesToMB(bytes: number): number {
  return bytes / (1024 * 1024);
}
