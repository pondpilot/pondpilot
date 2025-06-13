import { ReactNode, isValidElement } from 'react';

/**
 * Search implementation that prioritizes exact substring matches
 * Falls back to fuzzy matching only for short queries or when characters are close together
 */
export function fuzzyMatch(query: string, target: string | ReactNode): boolean {
  if (!query) return true;

  // Handle React elements or other non-string targets
  let targetString = '';
  if (typeof target === 'string') {
    targetString = target;
  } else if (target && typeof target === 'object') {
    // For React elements, try to extract text content
    // This is a simple approach - for complex elements, you might need more sophisticated extraction
    targetString = extractTextFromElement(target);
  } else {
    targetString = String(target || '');
  }

  const normalizedQuery = query.toLowerCase();
  const normalizedTarget = targetString.toLowerCase();

  // First, check for exact substring match
  if (normalizedTarget.includes(normalizedQuery)) {
    return true;
  }

  // For very short queries (1-2 chars), only do substring matching
  if (normalizedQuery.length <= 2) {
    return false;
  }

  // Check if query matches at word boundaries
  const words = normalizedTarget.split(/[\s\-_./\\]+/);
  for (const word of words) {
    if (word.startsWith(normalizedQuery)) {
      return true;
    }
  }

  // For longer queries, do a more restrictive fuzzy match
  // Only allow fuzzy matching if characters are found within a reasonable distance
  let queryIndex = 0;
  let lastMatchIndex = -1;
  const maxGap = 3; // Maximum gap between matched characters

  for (let i = 0; i < normalizedTarget.length && queryIndex < normalizedQuery.length; i += 1) {
    if (normalizedTarget[i] === normalizedQuery[queryIndex]) {
      // Check if gap between matches is too large
      if (lastMatchIndex !== -1 && i - lastMatchIndex > maxGap) {
        // Reset and try to find a better match
        queryIndex = 0;
        lastMatchIndex = -1;
        continue;
      }
      lastMatchIndex = i;
      queryIndex += 1;
    }
  }

  return queryIndex === normalizedQuery.length;
}

/**
 * Extract text content from a React element or object
 */
function extractTextFromElement(element: ReactNode): string {
  if (!element) return '';

  // Handle string directly
  if (typeof element === 'string' || typeof element === 'number') {
    return String(element);
  }

  // If it's a React element with children
  if (isValidElement(element)) {
    const props = element.props as { children?: ReactNode; title?: string };
    const { children, title } = props;

    // Check title prop first (common for tooltips)
    if (title) {
      return String(title);
    }

    // Process children
    if (children) {
      if (typeof children === 'string') {
        return children;
      }
      if (Array.isArray(children)) {
        return children.map((child) => extractTextFromElement(child)).join('');
      }
      return extractTextFromElement(children);
    }
  }

  return '';
}
