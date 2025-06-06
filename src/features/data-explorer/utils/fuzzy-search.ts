import { ReactNode, isValidElement } from 'react';

/**
 * Simple fuzzy search implementation
 * Returns true if all characters in the query appear in the target string in order
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

  let queryIndex = 0;

  for (let i = 0; i < normalizedTarget.length && queryIndex < normalizedQuery.length; i += 1) {
    if (normalizedTarget[i] === normalizedQuery[queryIndex]) {
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
