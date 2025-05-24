/**
 * Widget-specific UI builders for AI Assistant components
 */

import { EditorView } from '@codemirror/view';

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
import { AI_PROVIDERS } from '../../../models/ai-service';
import { getAIConfig } from '../../../utils/ai-config';
import { AsyncDuckDBConnectionPool } from '../../duckdb-context/duckdb-connection-pool';

/**
 * Creates a collapsible context section that combines SQL and Schema contexts
 */
export function createCombinedContextSection(
  sqlStatement: string | undefined,
  view: EditorView,
  connectionPool: AsyncDuckDBConnectionPool | null,
  modelSelect: HTMLSelectElement,
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

  // Create collapsible content area
  const contentArea = createContainer('ai-widget-context-content');
  contentArea.style.display = 'none'; // Start collapsed

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

      // Add models for this provider
      provider.models.forEach((model) => {
        selectOptions.push({
          value: model.id,
          label: model.name,
        });
      });
    }
  });

  // Fallback if no providers are logged in
  if (selectOptions.length === 0) {
    selectOptions.push({
      value: '',
      label: 'No models available - Configure API keys in Settings',
      disabled: true,
    });
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
  connectionPool: AsyncDuckDBConnectionPool | null,
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
  onClose: () => void,
  onSubmit: () => void,
  onTextareaKeyDown: (event: KeyboardEvent) => void,
): { inputSection: HTMLElement; textarea: HTMLTextAreaElement; generateBtn: HTMLButtonElement } {
  const inputSection = createContainer('ai-widget-input-section');
  const textareaContainer = createContainer('ai-widget-textarea-container');

  const textarea = createTextarea({
    placeholder: 'Ask AI to help with your SQL...',
    rows: 1,
    ariaLabel: 'AI assistant input',
    onKeyDown: onTextareaKeyDown,
  });

  const closeBtn = createCloseButton({
    onClose,
    ariaLabel: 'Close AI Assistant',
  });

  const generateBtn = createButton({
    textContent: 'Generate',
    className: 'ai-widget-generate',
    ariaLabel: 'Generate AI assistance',
    onClick: onSubmit,
  });

  textareaContainer.appendChild(textarea);
  inputSection.appendChild(textareaContainer);
  inputSection.appendChild(closeBtn);

  return { inputSection, textarea, generateBtn };
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

  const widgetContainer = createContainer('ai-widget-container');

  // Add combined context section (now includes model selector)
  widgetContainer.appendChild(components.contextSection);

  // Add input section
  widgetContainer.appendChild(components.inputSection);

  // Add footer
  widgetContainer.appendChild(components.footer);

  container.appendChild(widgetContainer);
  return container;
}
