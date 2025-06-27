/**
 * Utility to apply positioning styles to dropdown elements
 * These are the only styles that need to be inline because they're dynamic
 */

export interface DropdownPosition {
  position: 'fixed';
  zIndex: string;
  left: string;
  width: string;
  top?: string;
  bottom?: string;
}

/**
 * Gets the positioning styles for a dropdown
 * All other styles should be defined in CSS/theme files
 */
export function getDropdownPositionStyles(): Partial<CSSStyleDeclaration> {
  return {
    position: 'fixed',
    zIndex: '10000',
  };
}

/**
 * Calculates and applies dropdown position relative to a reference element
 */
export function positionDropdown(
  dropdown: HTMLElement,
  referenceRect: DOMRect,
  containerRect: DOMRect,
  itemHeight: number,
  maxHeight: number,
  itemCount: number,
): void {
  const dropdownHeight = Math.min(itemCount * itemHeight, maxHeight);
  const viewportHeight = window.innerHeight;
  const spaceBelow = viewportHeight - referenceRect.bottom;
  const spaceAbove = referenceRect.top;

  // Set horizontal position to match container width
  dropdown.style.left = `${containerRect.left}px`;
  dropdown.style.width = `${containerRect.width}px`;

  // Decide vertical position
  if (spaceBelow >= dropdownHeight + 20 || spaceBelow > spaceAbove) {
    // Position below
    dropdown.style.top = `${referenceRect.bottom + 4}px`;
    dropdown.style.bottom = 'auto';
  } else {
    // Position above
    dropdown.style.bottom = `${viewportHeight - referenceRect.top + 4}px`;
    dropdown.style.top = 'auto';
  }
}

/**
 * Gets error item specific styles
 */
export function getErrorItemStyles(): Partial<CSSStyleDeclaration> {
  return {
    cursor: 'default',
    opacity: '0.7',
  };
}
