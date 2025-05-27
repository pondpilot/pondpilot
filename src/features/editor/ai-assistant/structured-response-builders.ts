/**
 * UI builders for Structured Response Widget components
 */

import { createContainer, createButton, createFooter, createSpacer } from './ui-factories';
import { SQLAction, SQLAlternative } from '../../../models/structured-ai-response';
import { copyToClipboard } from '../../../utils/clipboard';

/**
 * Creates the header section with title and summary
 */
export function createResponseHeader(summary: string): HTMLElement {
  const header = createContainer('structured-response-header');

  const summaryTitle = document.createElement('h4');
  summaryTitle.textContent = '🤖 AI Assistant';
  summaryTitle.className = 'structured-response-title';

  const summaryElement = document.createElement('p');
  summaryElement.textContent = summary;
  summaryElement.className = 'structured-response-summary';

  header.appendChild(summaryTitle);
  header.appendChild(summaryElement);

  return header;
}

/**
 * Creates an action card with apply and copy buttons
 */
export function createActionCard(
  action: SQLAction,
  onApply: (action: SQLAction) => void,
  onClose: () => void,
): HTMLElement {
  const card = createContainer(action.recommended ? 'action-card recommended' : 'action-card');

  const description = createContainer('action-description');
  description.textContent = action.description;

  const codePreview = document.createElement('pre');
  codePreview.className = 'action-code-preview';
  codePreview.textContent = action.code;

  const confidence = createContainer('action-confidence');
  confidence.textContent = action.confidence
    ? `Confidence: ${Math.round(action.confidence * 100)}%`
    : '';

  const buttonsContainer = createContainer('action-buttons');

  const applyBtn = createButton({
    textContent: action.recommended ? 'Apply (Recommended)' : 'Apply',
    className: 'action-apply-btn',
    ariaLabel: `Apply action: ${action.description}`,
    onClick: () => onApply(action),
  });

  const copyBtn = createButton({
    textContent: 'Copy',
    className: 'action-copy-btn',
    ariaLabel: 'Copy code to clipboard',
    onClick: async () => {
      const success = await copyToClipboard(action.code, {
        showNotification: true,
        notificationTitle: 'Code Copied',
        notificationMessage: 'SQL code has been copied to clipboard',
      });

      if (success) {
        onClose();
      } else {
        console.warn('Copy operation failed');
      }
    },
  });

  buttonsContainer.appendChild(applyBtn);
  buttonsContainer.appendChild(copyBtn);

  card.appendChild(description);
  card.appendChild(codePreview);
  card.appendChild(confidence);
  card.appendChild(buttonsContainer);

  return card;
}

/**
 * Creates an alternative card with use and copy buttons
 */
export function createAlternativeCard(
  alternative: SQLAlternative,
  onApply: (alternative: SQLAlternative) => void,
  onClose: () => void,
): HTMLElement {
  const card = createContainer('alternative-card');

  const title = document.createElement('h6');
  title.className = 'alternative-title';
  title.textContent = alternative.title;

  const description = document.createElement('p');
  description.className = 'alternative-description';
  description.textContent = alternative.description;

  const codePreview = document.createElement('pre');
  codePreview.className = 'alternative-code-preview';
  codePreview.textContent = alternative.code;

  const buttonsContainer = createContainer('alternative-buttons');

  const useBtn = createButton({
    textContent: 'Use This',
    className: 'alternative-use-btn',
    ariaLabel: `Use alternative: ${alternative.title}`,
    onClick: () => onApply(alternative),
  });

  const copyBtn = createButton({
    textContent: 'Copy',
    className: 'alternative-copy-btn',
    ariaLabel: 'Copy alternative code to clipboard',
    onClick: async () => {
      const success = await copyToClipboard(alternative.code, {
        showNotification: true,
        notificationTitle: 'Alternative Code Copied',
        notificationMessage: 'Alternative SQL code has been copied to clipboard',
      });

      if (success) {
        onClose();
      } else {
        console.warn('Copy operation failed');
      }
    },
  });

  buttonsContainer.appendChild(useBtn);
  buttonsContainer.appendChild(copyBtn);

  card.appendChild(title);
  card.appendChild(description);
  card.appendChild(codePreview);
  card.appendChild(buttonsContainer);

  return card;
}

/**
 * Creates the actions section with multiple action cards
 */
export function createActionsSection(
  actions: SQLAction[],
  onApply: (action: SQLAction) => void,
  onClose: () => void,
): HTMLElement {
  const actionsSection = createContainer('structured-response-actions');

  if (actions.length > 0) {
    const actionsTitle = document.createElement('h5');
    actionsTitle.textContent = 'Suggested Actions:';
    actionsTitle.className = 'structured-response-section-title';
    actionsSection.appendChild(actionsTitle);

    actions.forEach((action, index) => {
      const actionCard = createActionCard(action, onApply, onClose, index + 1);
      actionsSection.appendChild(actionCard);
    });
  }

  return actionsSection;
}

/**
 * Creates the alternatives section with multiple alternative cards
 */
export function createAlternativesSection(
  alternatives: SQLAlternative[],
  onApply: (alternative: SQLAlternative) => void,
  onClose: () => void,
): HTMLElement | null {
  if (!alternatives || alternatives.length === 0) {
    return null;
  }

  const alternativesSection = createContainer('structured-response-alternatives');

  const altTitle = document.createElement('h5');
  altTitle.textContent = 'Alternative Approaches:';
  altTitle.className = 'structured-response-section-title';
  alternativesSection.appendChild(altTitle);

  alternatives.forEach((alternative) => {
    const altCard = createAlternativeCard(alternative, onApply, onClose);
    alternativesSection.appendChild(altCard);
  });

  return alternativesSection;
}

/**
 * Creates the footer with keyboard hints and close button
 */
export function createResponseFooter(onClose: () => void): HTMLElement {
  const footer = createFooter({
    className: 'structured-response-footer',
  });

  const keyboardHints = document.createElement('span');
  keyboardHints.className = 'structured-response-hints';
  keyboardHints.textContent = 'Enter to apply • C to copy and close • Esc to close';

  const spacer = createSpacer('structured-response-spacer');

  const closeBtn = createButton({
    textContent: 'Close',
    className: 'structured-response-close',
    ariaLabel: 'Close AI Assistant',
    onClick: onClose,
  });

  footer.appendChild(keyboardHints);
  footer.appendChild(spacer);
  footer.appendChild(closeBtn);

  return footer;
}

/**
 * Assembles the complete structured response widget
 */
export function assembleStructuredResponseWidget(components: {
  header: HTMLElement;
  actionsSection: HTMLElement;
  alternativesSection: HTMLElement | null;
  footer: HTMLElement;
}): HTMLElement {
  const container = createContainer('cm-structured-response-widget');
  container.contentEditable = 'false';

  const widgetContainer = createContainer('structured-response-container');

  widgetContainer.appendChild(components.header);
  widgetContainer.appendChild(components.actionsSection);

  if (components.alternativesSection) {
    widgetContainer.appendChild(components.alternativesSection);
  }

  widgetContainer.appendChild(components.footer);
  container.appendChild(widgetContainer);

  return container;
}
