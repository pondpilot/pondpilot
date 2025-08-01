/**
 * Widget-specific UI builders for AI Assistant components
 */

import { EditorView } from '@codemirror/view';
import { ConnectionPool } from '@engines/types';

import {
  createContainer,
  createTextarea,
  createCloseButton,
  createButton,
  createFooter,
  createSpacer,
  createSection,
  createSelect,
} from './ui-factories';
import { TabExecutionError } from '../../../controllers/tab/tab-controller';
import { AI_PROVIDERS } from '../../../models/ai-service';
import { getAIConfig } from '../../../utils/ai-config';
import { navigateToSettings } from '../../../utils/route-navigation';

/**
 * Creates a collapsible context section that combines SQL and Schema contexts
 */
export function createCombinedContextSection(
  sqlStatement: string | undefined,
  view: EditorView,
  connectionPool: ConnectionPool | null,
  modelSelect: HTMLSelectElement,
  errorContext?: TabExecutionError,
  onClose?: () => void,
  activeRequest?: boolean,
): HTMLElement {
  const contextSection = createContainer('ai-widget-combined-context');

  // Create header with toggle functionality and model selector
  const headerSection = createContainer('ai-widget-context-header');

  const leftSection = createContainer('ai-widget-context-left');

  const toggleIcon = document.createElement('span');
  toggleIcon.className = 'ai-widget-context-toggle';
  toggleIcon.textContent = '▶';

  const headerLabel = document.createElement('span');
  headerLabel.className = 'ai-widget-context-header-label';
  headerLabel.textContent = 'Context';

  leftSection.appendChild(toggleIcon);
  leftSection.appendChild(headerLabel);

  headerSection.appendChild(leftSection);
  headerSection.appendChild(modelSelect);

  // Add close button to header if handler provided
  if (onClose) {
    const closeBtn = createCloseButton({
      onClose,
      ariaLabel: 'Close AI Assistant',
    });

    // Disable close button if request is active
    if (activeRequest) {
      closeBtn.disabled = true;
      closeBtn.style.opacity = '0.5';
      closeBtn.style.cursor = 'not-allowed';
    }

    headerSection.appendChild(closeBtn);
  }

  // Create collapsible content area
  const contentArea = createContainer('ai-widget-context-content');
  contentArea.style.display = 'none'; // Start collapsed

  // Add error context if available
  if (errorContext) {
    const errorSection = createContainer('ai-widget-context-subsection');
    errorSection.style.borderLeft = '3px solid #e74c3c';
    errorSection.style.paddingLeft = '10px';

    const errorLabel = document.createElement('div');
    errorLabel.className = 'ai-widget-context-sublabel';
    errorLabel.style.color = '#e74c3c';
    errorLabel.textContent = '⚠️ SQL Error:';

    const errorMessage = document.createElement('div');
    errorMessage.className = 'ai-widget-context-code';
    errorMessage.style.color = '#e74c3c';
    errorMessage.textContent = errorContext.errorMessage;

    errorSection.appendChild(errorLabel);
    errorSection.appendChild(errorMessage);
    contentArea.appendChild(errorSection);

    // Auto-expand when there's an error
    contentArea.style.display = 'block';
    toggleIcon.textContent = '▼';
  }

  // Add SQL context if available
  if (sqlStatement && sqlStatement.trim()) {
    const sqlSection = createContainer('ai-widget-context-subsection');

    const sqlLabel = document.createElement('div');
    sqlLabel.className = 'ai-widget-context-sublabel';
    sqlLabel.textContent = 'SQL Context:';

    const contextCode = document.createElement('code');
    contextCode.className = 'ai-widget-context-code';
    contextCode.textContent = sqlStatement.trim();

    sqlSection.appendChild(sqlLabel);
    sqlSection.appendChild(contextCode);
    contentArea.appendChild(sqlSection);
  }

  // Add schema context section
  const schemaSection = createContainer('ai-widget-context-subsection');

  const schemaLabel = document.createElement('div');
  schemaLabel.className = 'ai-widget-context-sublabel';
  schemaLabel.textContent = 'Database Schema:';

  const schemaIndicator = document.createElement('div');
  schemaIndicator.className = 'ai-widget-schema-indicator';

  // Helper function to update schema indicator
  const updateSchemaIndicator = () => {
    if (connectionPool) {
      schemaIndicator.textContent = '';
      const icon = document.createTextNode('🗄️ ');
      const span = document.createElement('span');
      span.textContent = 'Available - AI will include table/column info';
      schemaIndicator.appendChild(icon);
      schemaIndicator.appendChild(span);
      schemaIndicator.className = 'ai-widget-schema-indicator available';
    } else {
      schemaIndicator.textContent = '';
      const icon = document.createTextNode('📋 ');
      const span = document.createElement('span');
      span.textContent = 'Not available - AI will work with query only';
      schemaIndicator.appendChild(icon);
      schemaIndicator.appendChild(span);
      schemaIndicator.className = 'ai-widget-schema-indicator not-available';
    }
  };

  // Initial update
  updateSchemaIndicator();

  schemaSection.appendChild(schemaLabel);
  schemaSection.appendChild(schemaIndicator);

  // Add hint about @mentions
  const mentionHint = document.createElement('div');
  mentionHint.className = 'ai-widget-mention-hint';
  mentionHint.style.fontSize = '12px';
  mentionHint.style.marginTop = '4px';
  mentionHint.style.opacity = '0.7';
  mentionHint.textContent = 'Tip: Use @ to mention specific tables in your prompt';
  schemaSection.appendChild(mentionHint);

  contentArea.appendChild(schemaSection);

  // Add toggle functionality (only for the left section, not the model select)
  const toggleContent = () => {
    const isCollapsed = contentArea.style.display === 'none';
    contentArea.style.display = isCollapsed ? 'block' : 'none';
    toggleIcon.textContent = isCollapsed ? '▼' : '▶';
  };

  leftSection.addEventListener('click', toggleContent);
  leftSection.style.cursor = 'pointer';

  contextSection.appendChild(headerSection);
  contextSection.appendChild(contentArea);

  return contextSection;
}

/**
 * Creates the model selection section with available models from logged-in providers
 */
export function createModelSelectionSection(onModelChange: (model: string) => void): {
  modelSection: HTMLElement;
  modelSelect: HTMLSelectElement;
} {
  const modelSection = createContainer('ai-widget-model-section');

  // Get current config to determine logged-in providers and current model
  const config = getAIConfig();
  const apiKeys = config.apiKeys || {};
  const currentModel = config.model;

  // Build available models with provider groups
  const selectOptions: Array<{
    value: string;
    label: string;
    disabled?: boolean;
    isGroup?: boolean;
  }> = [];

  AI_PROVIDERS.forEach((provider) => {
    const hasApiKey = apiKeys[provider.id] && apiKeys[provider.id].trim() !== '';
    if (hasApiKey) {
      // Add provider group header
      selectOptions.push({
        value: '',
        label: provider.name,
        isGroup: true,
      });

      // Handle custom provider with custom models
      if (provider.id === 'custom' && config.customModels && config.customModels.length > 0) {
        config.customModels.forEach((model) => {
          selectOptions.push({
            value: model.id,
            label: model.name,
          });
        });
      } else {
        // Add regular provider models
        provider.models.forEach((model) => {
          selectOptions.push({
            value: model.id,
            label: model.name,
          });
        });
      }
    }
  });

  // If no providers are logged in, create a dummy select that acts like a button
  if (selectOptions.length === 0) {
    const dummySelect = document.createElement('select');
    dummySelect.className = 'ai-widget-select ai-widget-select-button';
    dummySelect.setAttribute('aria-label', 'Go to Settings to configure API keys');

    const option = document.createElement('option');
    option.textContent = 'Configure API Keys →';
    option.value = '';
    dummySelect.appendChild(option);

    dummySelect.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigateToSettings();
    });

    dummySelect.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent dropdown from opening
    });

    modelSection.appendChild(dummySelect);

    return { modelSection, modelSelect: dummySelect };
  }

  const modelSelect = createSelect({
    options: selectOptions,
    value: currentModel,
    className: 'ai-widget-select',
    ariaLabel: 'Select AI model',
    onChange: onModelChange,
  });

  modelSection.appendChild(modelSelect);

  return { modelSection, modelSelect };
}

/**
 * Creates the schema context section with availability indicator
 */
export function createSchemaContextSection(
  view: EditorView,
  connectionPool: ConnectionPool | null,
): HTMLElement {
  const { section } = createSection(
    'Database Schema:',
    'ai-widget-schema-context',
    'ai-widget-schema-context-label',
  );

  const schemaIndicator = document.createElement('div');
  schemaIndicator.className = 'ai-widget-schema-indicator';

  // Helper function to update schema indicator
  const updateSchemaIndicator = () => {
    if (connectionPool) {
      // Create elements safely without innerHTML
      schemaIndicator.textContent = '';
      const icon = document.createTextNode('🗄️ ');
      const span = document.createElement('span');
      span.textContent = 'Available - AI will include table/column info';
      schemaIndicator.appendChild(icon);
      schemaIndicator.appendChild(span);
      schemaIndicator.className = 'ai-widget-schema-indicator available';
    } else {
      schemaIndicator.textContent = '';
      const icon = document.createTextNode('📋 ');
      const span = document.createElement('span');
      span.textContent = 'Not available - AI will work with query only';
      schemaIndicator.appendChild(icon);
      schemaIndicator.appendChild(span);
      schemaIndicator.className = 'ai-widget-schema-indicator not-available';
    }
  };

  // Initial update
  updateSchemaIndicator();

  section.appendChild(schemaIndicator);
  return section;
}

/**
 * Creates the input section with textarea and close button
 */
export function createInputSection(
  onSubmit: () => void,
  onTextareaKeyDown: (event: KeyboardEvent) => void,
  errorContext?: TabExecutionError,
  activeRequest?: boolean,
  currentPrompt?: string,
  onPromptChange?: (value: string) => void,
): {
  inputSection: HTMLElement;
  textarea: HTMLTextAreaElement;
  generateBtn: HTMLButtonElement;
  textareaContainer: HTMLElement;
} {
  const inputSection = createContainer('ai-widget-input-section');
  const textareaContainer = createContainer('ai-widget-textarea-container');

  const placeholder = errorContext
    ? 'Press Enter to fix the error, or describe what you want...'
    : 'Ask AI to help with your SQL... (use @ to mention tables)';

  const textarea = createTextarea({
    placeholder,
    rows: 1,
    ariaLabel: 'AI assistant input',
    onKeyDown: onTextareaKeyDown,
    onInput: onPromptChange
      ? (e) => onPromptChange((e.target as HTMLTextAreaElement).value)
      : undefined,
  });

  // Set initial value if provided
  if (currentPrompt !== undefined) {
    textarea.value = currentPrompt;
  }

  const buttonText = errorContext ? 'Fix Error' : 'Generate';
  const generateBtn = createButton({
    textContent: buttonText,
    className: 'ai-widget-generate',
    ariaLabel: errorContext ? 'Fix SQL error' : 'Generate AI assistance',
    onClick: onSubmit,
  });

  // If request is active, show loading state
  if (activeRequest) {
    generateBtn.disabled = true;
    generateBtn.classList.add('ai-widget-loading');
    generateBtn.textContent = '';

    const loadingDots = document.createElement('span');
    loadingDots.className = 'ai-widget-loading-dots';
    loadingDots.textContent = '...';
    generateBtn.appendChild(loadingDots);
  }

  textareaContainer.appendChild(textarea);
  inputSection.appendChild(textareaContainer);

  return { inputSection, textarea, generateBtn, textareaContainer };
}

/**
 * Creates the widget footer with controls and hints
 */
export function createWidgetFooter(generateBtn: HTMLButtonElement): HTMLElement {
  const footer = createFooter({
    hint: 'Enter to send • Shift+Enter for new line • Esc to close',
  });

  const spacer = createSpacer();

  footer.appendChild(spacer);
  footer.appendChild(generateBtn);

  return footer;
}

/**
 * Assembles the complete AI Assistant widget DOM structure
 */
export function assembleAIAssistantWidget(components: {
  contextSection: HTMLElement;
  inputSection: HTMLElement;
  footer: HTMLElement;
}): HTMLElement {
  const container = createContainer('cm-ai-assistant-widget');
  container.contentEditable = 'false';
  container.tabIndex = -1;

  // Detect and apply the current theme from the parent document
  const rootElement = document.documentElement;
  const currentColorScheme = rootElement.getAttribute('data-mantine-color-scheme');
  if (currentColorScheme) {
    container.setAttribute('data-mantine-color-scheme', currentColorScheme);
  }

  const widgetContainer = createContainer('ai-widget-container');

  // Add ARIA live region for announcements
  const liveRegion = document.createElement('div');
  liveRegion.className = 'ai-widget-live-region';
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  liveRegion.style.cssText =
    'position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden;';
  widgetContainer.appendChild(liveRegion);

  // Add combined context section (now includes model selector)
  widgetContainer.appendChild(components.contextSection);

  // Add input section
  widgetContainer.appendChild(components.inputSection);

  // Add footer
  widgetContainer.appendChild(components.footer);

  container.appendChild(widgetContainer);
  return container;
}
