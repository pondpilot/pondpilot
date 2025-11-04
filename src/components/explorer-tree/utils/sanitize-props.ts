/**
 * Sanitizes HTML props before spreading them onto DOM elements.
 * This prevents XSS attacks by filtering out potentially dangerous attributes.
 */

// Props that are safe to spread onto DOM elements
const SAFE_PROP_PATTERNS = [
  /^data-/,
  /^aria-/,
  /^role$/,
  /^id$/,
  /^title$/,
  /^tabindex$/i,
  /^style$/,
  /^className$/,
];

// Props that should never be spread (security risk)
const BLOCKED_PROPS = new Set(['dangerouslySetInnerHTML', 'innerHTML', 'outerHTML', 'srcdoc']);

/**
 * Checks if a prop name is safe to spread onto a DOM element
 */
function isSafeProp(propName: string): boolean {
  // Block explicitly dangerous props
  if (BLOCKED_PROPS.has(propName)) {
    return false;
  }

  // Block event handlers (on*)
  if (propName.startsWith('on')) {
    return false;
  }

  // Allow safe patterns
  return SAFE_PROP_PATTERNS.some((pattern) => pattern.test(propName));
}

/**
 * Sanitizes an object of HTML props, removing potentially dangerous attributes
 */
export function sanitizeHTMLProps<T extends Record<string, any>>(props: T): Partial<T> {
  const sanitized: Partial<T> = {};

  for (const key in props) {
    if (Object.prototype.hasOwnProperty.call(props, key) && isSafeProp(key)) {
      sanitized[key] = props[key];
    }
  }

  return sanitized;
}
