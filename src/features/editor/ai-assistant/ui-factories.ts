/**
 * Shared UI factory functions for AI Assistant widgets
 * These functions create reusable DOM elements with consistent styling and behavior
 */

export interface CloseButtonOptions {
  onClose: () => void;
  ariaLabel?: string;
  className?: string;
  textContent?: string;
}

export interface TextareaOptions {
  placeholder?: string;
  rows?: number;
  ariaLabel?: string;
  className?: string;
  onInput?: (event: Event) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
}

export interface ButtonOptions {
  textContent: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  onClick: (event: MouseEvent) => void;
}

export interface FooterOptions {
  hint?: string;
  className?: string;
}

export interface SelectOptions {
  options: Array<{ value: string; label: string; disabled?: boolean; isGroup?: boolean }>;
  value?: string;
  className?: string;
  ariaLabel?: string;
  onChange?: (value: string) => void;
}

/**
 * Creates a standardized close button
 */
export function createCloseButton(options: CloseButtonOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = options.className || 'ai-widget-close';
  button.textContent = options.textContent || '×';
  button.setAttribute('aria-label', options.ariaLabel || 'Close AI Assistant');

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    options.onClose();
  });

  return button;
}

/**
 * Creates a standardized textarea with auto-resize functionality
 */
export function createTextarea(options: TextareaOptions): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  textarea.className = options.className || 'ai-widget-textarea';
  textarea.placeholder = options.placeholder || '';
  textarea.rows = options.rows || 1;

  if (options.ariaLabel) {
    textarea.setAttribute('aria-label', options.ariaLabel);
    textarea.setAttribute('role', 'textbox');
  }

  // Auto-resize functionality
  const autoResize = () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  };

  // Add event listeners
  if (options.onInput) {
    textarea.addEventListener('input', (e) => {
      options.onInput!(e);
      autoResize();
    });
  } else {
    textarea.addEventListener('input', autoResize);
  }

  if (options.onKeyDown) {
    textarea.addEventListener('keydown', options.onKeyDown);
  }

  return textarea;
}

/**
 * Creates a standardized button with consistent styling
 */
export function createButton(options: ButtonOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = options.className || 'ai-widget-button';
  button.textContent = options.textContent;
  button.disabled = options.disabled || false;

  if (options.ariaLabel) {
    button.setAttribute('aria-label', options.ariaLabel);
  }

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    options.onClick(e);
  });

  return button;
}

/**
 * Creates a container element with standard styling
 */
export function createContainer(className: string): HTMLDivElement {
  const container = document.createElement('div');
  container.className = className;
  return container;
}

/**
 * Creates a footer section with hints and controls
 */
export function createFooter(options: FooterOptions): HTMLDivElement {
  const footer = document.createElement('div');
  footer.className = options.className || 'ai-widget-footer';

  if (options.hint) {
    const hint = document.createElement('span');
    hint.className = 'ai-widget-hint';
    hint.textContent = options.hint;
    footer.appendChild(hint);
  }

  return footer;
}

/**
 * Creates a spacer element for flex layouts
 */
export function createSpacer(className: string = 'ai-widget-spacer'): HTMLDivElement {
  const spacer = document.createElement('div');
  spacer.className = className;
  return spacer;
}

/**
 * Adds event propagation stopping to a container element
 */
export function preventEventPropagation(element: HTMLElement): void {
  const events = ['keydown', 'keyup', 'keypress', 'mousedown', 'click', 'copy', 'cut', 'paste', 'contextmenu'];

  events.forEach((eventType) => {
    element.addEventListener(eventType, (e) => {
      // Allow copy/cut/paste events to work normally
      if (eventType === 'copy' || eventType === 'cut' || eventType === 'paste') {
        // Just stop propagation, don't prevent default
        e.stopPropagation();
        return;
      }

      // Allow context menu (right-click) to work normally
      if (eventType === 'contextmenu') {
        // Just stop propagation, don't prevent default
        e.stopPropagation();
        return;
      }

      // For keyboard events, allow copy/paste keyboard shortcuts
      if (eventType === 'keydown' || eventType === 'keyup' || eventType === 'keypress') {
        const keyEvent = e as KeyboardEvent;
        // Allow Cmd/Ctrl + C/V/X/A
        if ((keyEvent.metaKey || keyEvent.ctrlKey) &&
            (keyEvent.key === 'c' || keyEvent.key === 'v' ||
             keyEvent.key === 'x' || keyEvent.key === 'a' ||
             keyEvent.key === 'C' || keyEvent.key === 'V' ||
             keyEvent.key === 'X' || keyEvent.key === 'A')) {
          // Just stop propagation to prevent editor from handling it
          e.stopPropagation();
          return;
        }
      }

      // For other events, stop propagation
      e.stopPropagation();
    });
  });
}

/**
 * Creates a standardized select dropdown with optgroup support
 */
export function createSelect(options: SelectOptions): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = options.className || 'ai-widget-select';

  if (options.ariaLabel) {
    select.setAttribute('aria-label', options.ariaLabel);
  }

  let currentOptGroup: HTMLOptGroupElement | null = null;

  options.options.forEach((option) => {
    if (option.isGroup) {
      // Create a new optgroup
      currentOptGroup = document.createElement('optgroup');
      currentOptGroup.label = option.label;
      select.appendChild(currentOptGroup);
    } else {
      // Create an option element
      const optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      optionElement.disabled = option.disabled || false;

      // Add to the current optgroup or directly to select
      if (currentOptGroup) {
        currentOptGroup.appendChild(optionElement);
      } else {
        select.appendChild(optionElement);
      }
    }
  });

  if (options.value) {
    select.value = options.value;
  }

  if (options.onChange) {
    select.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      options.onChange!(target.value);
    });
  }

  return select;
}

/**
 * Creates a section with a label and content
 */
export function createSection(
  labelText: string,
  className: string,
  labelClassName: string = 'ai-widget-section-label',
): { section: HTMLDivElement; label: HTMLDivElement } {
  const section = document.createElement('div');
  section.className = className;

  const label = document.createElement('div');
  label.className = labelClassName;
  label.textContent = labelText;

  section.appendChild(label);

  return { section, label };
}
