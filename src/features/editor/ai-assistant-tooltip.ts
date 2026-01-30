import * as monaco from 'monaco-editor';

import { TabExecutionError } from '../../controllers/tab/tab-controller';
import { AI_PROVIDERS } from '../../models/ai-service';
import { SQLScript } from '../../models/sql-script';
import { StructuredSQLResponse } from '../../models/structured-ai-response';
import { getAIConfig, saveAIConfig } from '../../utils/ai-config';
import { resolveAIContext } from '../../utils/editor/statement-parser';
import { AsyncDuckDBConnectionPool } from '../duckdb-context/duckdb-connection-pool';
import { createAIAssistantHandlers } from './ai-assistant/ai-assistant-handlers';
import { UI_SELECTORS } from './ai-assistant/constants';
import { logError } from './ai-assistant/error-handler';
import { HistoryNavigationManager } from './ai-assistant/managers/history-manager';
import { MentionManager } from './ai-assistant/managers/mention-manager';
import { AIAssistantEditorAdapter } from './ai-assistant/model';
import { createAIAssistantServices, AIAssistantServices } from './ai-assistant/services-facet';
import { StructuredResponseWidget } from './ai-assistant/structured-response-widget';
import { createCleanupRegistry } from './ai-assistant/utils/cleanup-registry';
import {
  assembleAIAssistantWidget,
  createCombinedContextSection,
  createInputSection,
  createModelSelectionSection,
  createWidgetFooter,
} from './ai-assistant/widget-builders';

interface AIAssistantManagerOptions {
  connectionPool?: AsyncDuckDBConnectionPool | null;
  services?: AIAssistantServices;
  sqlScripts?: Map<string, SQLScript>;
  onVisibilityChange?: (visible: boolean, structuredVisible: boolean) => void;
}

const createMonacoEditorAdapter = (
  editor: monaco.editor.IStandaloneCodeEditor,
): AIAssistantEditorAdapter => ({
  getValue: () => editor.getValue(),
  getSelection: () => {
    const model = editor.getModel();
    const selection = editor.getSelection();
    if (!model || !selection) {
      return { from: 0, to: 0 };
    }
    return {
      from: model.getOffsetAt(selection.getStartPosition()),
      to: model.getOffsetAt(selection.getEndPosition()),
    };
  },
  getCursorOffset: () => {
    const model = editor.getModel();
    const position = editor.getPosition();
    if (!model || !position) return 0;
    return model.getOffsetAt(position);
  },
  replaceRange: (text: string, from: number, to: number) => {
    const model = editor.getModel();
    if (!model) return;
    const start = model.getPositionAt(from);
    const end = model.getPositionAt(to);
    editor.executeEdits('ai-assistant', [
      {
        range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
        text,
        forceMoveMarkers: true,
      },
    ]);
  },
  insertText: (text: string, offset: number) => {
    const model = editor.getModel();
    if (!model) return;
    const start = model.getPositionAt(offset);
    editor.executeEdits('ai-assistant', [
      {
        range: new monaco.Range(start.lineNumber, start.column, start.lineNumber, start.column),
        text,
        forceMoveMarkers: true,
      },
    ]);
  },
  focus: () => {
    editor.focus();
  },
});

/**
 * Measure the rendered height of a DOM element by temporarily
 * attaching it off-screen inside a container that matches the
 * target width context.
 *
 * @param dom - The element to measure.
 * @param container - The container whose width context should be
 *   used for measurement (e.g. the editor DOM node). Falls back
 *   to document.body when not provided.
 */
function measureDomHeight(dom: HTMLElement, container?: HTMLElement | null): number {
  const savedPosition = dom.style.position;
  const savedVisibility = dom.style.visibility;
  const savedLeft = dom.style.left;

  const parent = container ?? document.body;

  dom.style.position = 'absolute';
  dom.style.visibility = 'hidden';
  dom.style.left = '-9999px';

  parent.appendChild(dom);
  try {
    const { height } = dom.getBoundingClientRect();
    return Math.ceil(height);
  } finally {
    parent.removeChild(dom);
    dom.style.position = savedPosition;
    dom.style.visibility = savedVisibility;
    dom.style.left = savedLeft;
  }
}

class MonacoAIAssistantManager implements monaco.IDisposable {
  private assistantZoneId: string | null = null;
  private structuredZoneId: string | null = null;
  private assistantResizeObserver?: ResizeObserver;
  private structuredResizeObserver?: ResizeObserver;
  private assistantResizeRaf: number | null = null;
  private structuredResizeRaf: number | null = null;
  private activeRequest = false;
  private abortController: AbortController | null = null;
  private currentPrompt: string | undefined;
  private cleanup?: () => void;
  private structuredCleanup?: () => void;

  constructor(
    private editor: monaco.editor.IStandaloneCodeEditor,
    private options: AIAssistantManagerOptions,
  ) {}

  /**
   * Elevate `.view-zones` above `.view-lines` so that interactive widgets
   * inside a view zone receive pointer events. Without this, `.view-lines`
   * (rendered after `.view-zones` in the DOM) intercepts all mouse events.
   *
   * Uses a CSS class on the editor root so the rule is defined in the
   * stylesheet rather than via inline styles.
   *
   * Note: while any AI zone is visible, ALL view zones in this editor
   * are elevated. This is acceptable because the toggle is scoped to
   * the lifetime of an AI zone.
   */
  private setViewZonesInteractive(interactive: boolean) {
    const domNode = this.editor.getDomNode();
    if (!domNode) return;
    domNode.classList.toggle('ai-viewzones-interactive', interactive);

    const viewZones = domNode.querySelector('.view-zones') as HTMLElement | null;
    if (!viewZones) return;
    if (interactive) {
      viewZones.style.zIndex = '50';
    } else {
      viewZones.style.zIndex = '';
    }
  }

  private clearResizeObserver(kind: 'assistant' | 'structured') {
    if (kind === 'assistant') {
      this.assistantResizeObserver?.disconnect();
      this.assistantResizeObserver = undefined;
      if (this.assistantResizeRaf !== null) {
        window.cancelAnimationFrame(this.assistantResizeRaf);
        this.assistantResizeRaf = null;
      }
      return;
    }

    this.structuredResizeObserver?.disconnect();
    this.structuredResizeObserver = undefined;
    if (this.structuredResizeRaf !== null) {
      window.cancelAnimationFrame(this.structuredResizeRaf);
      this.structuredResizeRaf = null;
    }
  }

  private installResizeObserver(
    domNode: HTMLElement,
    zone: monaco.editor.IViewZone,
    getZoneId: () => string | null,
    kind: 'assistant' | 'structured',
  ) {
    if (typeof ResizeObserver === 'undefined') return;

    this.clearResizeObserver(kind);

    let lastHeight = zone.heightInPx;

    const updateHeight = () => {
      const zoneId = getZoneId();
      if (!zoneId) return;
      const newHeight = Math.ceil(domNode.getBoundingClientRect().height);
      if (!newHeight || newHeight === lastHeight) return;
      lastHeight = newHeight;
      zone.heightInPx = newHeight;
      this.editor.changeViewZones((accessor) => {
        accessor.layoutZone(zoneId);
      });
    };

    const observer = new ResizeObserver(() => {
      if (kind === 'assistant') {
        if (this.assistantResizeRaf !== null) return;
        this.assistantResizeRaf = window.requestAnimationFrame(() => {
          this.assistantResizeRaf = null;
          updateHeight();
        });
        return;
      }

      if (this.structuredResizeRaf !== null) return;
      this.structuredResizeRaf = window.requestAnimationFrame(() => {
        this.structuredResizeRaf = null;
        updateHeight();
      });
    });

    observer.observe(domNode);

    if (kind === 'assistant') {
      this.assistantResizeObserver = observer;
    } else {
      this.structuredResizeObserver = observer;
    }
  }

  /**
   * Create a view zone in the editor below the given line, measure
   * its height within the editor container, and enable pointer
   * interactivity for all view zones.
   */
  private addInteractiveZone(
    afterLineNumber: number,
    domNode: HTMLElement,
    kind: 'assistant' | 'structured',
  ): string {
    const heightInPx = measureDomHeight(domNode, this.editor.getDomNode());
    let zoneId = '';
    const zone: monaco.editor.IViewZone = {
      afterLineNumber,
      heightInPx,
      domNode,
      suppressMouseDown: false,
    };
    this.editor.changeViewZones((accessor) => {
      zoneId = accessor.addZone(zone);
    });
    if (kind === 'assistant') {
      this.assistantZoneId = zoneId;
    } else {
      this.structuredZoneId = zoneId;
    }
    this.setViewZonesInteractive(true);
    this.installResizeObserver(
      domNode,
      zone,
      () => (kind === 'assistant' ? this.assistantZoneId : this.structuredZoneId),
      kind,
    );
    return zoneId;
  }

  /** Remove a view zone and disable interactivity when no AI zones remain. */
  private removeZone(zoneId: string) {
    this.editor.changeViewZones((accessor) => {
      accessor.removeZone(zoneId);
    });
    if (!this.assistantZoneId && !this.structuredZoneId) {
      this.setViewZonesInteractive(false);
    }
  }

  private notifyVisibility() {
    this.options.onVisibilityChange?.(
      !!this.assistantZoneId,
      !!this.structuredZoneId,
    );
  }

  private buildAdapter(): AIAssistantEditorAdapter {
    return createMonacoEditorAdapter(this.editor);
  }

  private async buildAssistantDom(errorContext?: TabExecutionError) {
    const adapter = this.buildAdapter();
    const selection = adapter.getSelection();
    const sqlStatement = await resolveAIContext(adapter.getValue(), selection);

    const cursorPos = this.editor.getPosition();
    const model = this.editor.getModel();
    const currentLineText = model && cursorPos ? model.getLineContent(cursorPos.lineNumber) : '';

    const cursorContext = {
      isOnEmptyLine: currentLineText.trim() === '',
      hasExistingQuery: adapter.getValue().trim().length > 0,
    };

    const services =
      this.options.services ||
      createAIAssistantServices(this.options.connectionPool, undefined, this.options.sqlScripts);

    const handlers = createAIAssistantHandlers(
      adapter,
      sqlStatement?.text,
      services,
      {
        onHide: () => this.hideAssistant(),
        onStructuredResponse: (response) => this.showStructuredResponse(response),
        onInsertResponse: (text) => this.insertAIResponse(text),
        onActiveRequestChange: (active) => {
          this.activeRequest = active;
        },
        getActiveRequest: () => this.activeRequest,
        setAbortController: (controller) => {
          this.abortController = controller;
        },
        getAbortController: () => this.abortController,
      },
      errorContext,
      cursorContext,
    );

    const handleModelChange = (selectedModel: string) => {
      const currentConfig = getAIConfig();

      let selectedProvider = currentConfig.provider;
      let isReasoningModel = false;

      if (currentConfig.customModels?.some((customModel) => customModel.id === selectedModel)) {
        selectedProvider = 'custom';
      } else {
        for (const provider of AI_PROVIDERS) {
          const providerModel = provider.models.find((item) => item.id === selectedModel);
          if (providerModel) {
            selectedProvider = provider.id;
            isReasoningModel = providerModel.reasoning || false;
            break;
          }
        }
      }

      const updatedConfig = {
        ...currentConfig,
        provider: selectedProvider,
        model: selectedModel,
        apiKey: currentConfig.apiKeys?.[selectedProvider] || currentConfig.apiKey,
        reasoning: isReasoningModel,
      };

      saveAIConfig(updatedConfig);
      services.aiService.updateConfig(updatedConfig);
    };

    const { modelSelect } = createModelSelectionSection(handleModelChange);

    const contextSection = createCombinedContextSection(
      sqlStatement?.text,
      this.options.connectionPool || null,
      modelSelect,
      errorContext,
      handlers.hideWidget,
      this.activeRequest,
    );

    let submitWrapper: () => void;

    const { inputSection, textarea, generateBtn } = createInputSection(
      () => submitWrapper(),
      () => {},
      errorContext,
      this.activeRequest,
      this.currentPrompt,
      (value) => {
        this.currentPrompt = value;
      },
    );

    const mentionManager = new MentionManager(textarea, generateBtn, services);
    const historyManager = new HistoryNavigationManager(textarea);

    submitWrapper = () => {
      if (mentionManager.state.isActive) return;

      if (this.activeRequest) {
        handlers.cancelRequest();
        return;
      }

      historyManager.resetHistory();
      handlers.handleSubmit(textarea, generateBtn);
    };

    const shouldMentionHandleKey = (event: KeyboardEvent): boolean => {
      if (!mentionManager.state.isActive) return false;
      return mentionManager.handleNavigation(event);
    };

    const shouldHistoryHandleKey = (event: KeyboardEvent): boolean => {
      if (mentionManager.state.isActive) return false;
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return false;
      return historyManager.handleNavigation(event);
    };

    const shouldUseDefaultHandler = (event: KeyboardEvent): boolean => {
      if (!mentionManager.state.isActive) return true;
      return event.key !== 'Enter' && event.key !== 'Tab';
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldMentionHandleKey(event)) {
        return;
      }
      if (shouldHistoryHandleKey(event)) {
        return;
      }
      if (shouldUseDefaultHandler(event)) {
        handlers.handleTextareaKeyDown(event, submitWrapper, handlers.hideWidget);
      }
    };

    const cleanupRegistry = createCleanupRegistry();

    cleanupRegistry.addEventListener(textarea, 'keydown', handleKeyDown);

    const handleInput = async () => {
      this.currentPrompt = textarea.value;
      await mentionManager.handleInput(() => historyManager.handleManualInput());
    };

    cleanupRegistry.addEventListener(textarea, 'input', handleInput);

    const footer = createWidgetFooter(generateBtn);

    const container = assembleAIAssistantWidget({
      contextSection,
      inputSection,
      footer,
    });

    const themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === 'attributes' &&
          mutation.attributeName === 'data-mantine-color-scheme'
        ) {
          const newColorScheme = document.documentElement.getAttribute('data-mantine-color-scheme');
          if (newColorScheme) {
            container.setAttribute('data-mantine-color-scheme', newColorScheme);
          }
        }
      });
    });

    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-mantine-color-scheme'],
    });

    const originalCleanup = handlers.setupEventHandlers(container, handlers.hideWidget);
    this.cleanup = () => {
      mentionManager.cleanup();
      themeObserver.disconnect();
      originalCleanup();
      cleanupRegistry.dispose();
    };

    return container;
  }

  private insertAIResponse(text: string) {
    const model = this.editor.getModel();
    const position = this.editor.getPosition();
    if (!model || !position) return;

    const lineStartOffset = model.getOffsetAt({ lineNumber: position.lineNumber, column: 1 });

    // Sanitize text to prevent SQL comment injection
    // Escape both /* and */ to prevent nested comments or comment breakout
    const sanitizeLine = (line: string): string =>
      line.replace(/\/\*/g, '/ *').replace(/\*\//g, '* /');

    const lines = text.split('\n');
    let formattedComment = '/*\n';
    formattedComment += ' * AI Assistant Response:\n';
    formattedComment += ` * ${'-'.repeat(50)}\n`;

    lines.forEach((textLine) => {
      const sanitizedLine = sanitizeLine(textLine);
      if (sanitizedLine.trim() === '') {
        formattedComment += ' *\n';
      } else {
        const maxLineLength = 77;
        if (sanitizedLine.length > maxLineLength) {
          const words = sanitizedLine.split(' ');
          let currentLine = '';
          words.forEach((word) => {
            if (currentLine.length + word.length + 1 > maxLineLength) {
              formattedComment += ` * ${currentLine.trim()}\n`;
              currentLine = `${word} `;
            } else {
              currentLine += `${word} `;
            }
          });
          if (currentLine.trim()) {
            formattedComment += ` * ${currentLine.trim()}\n`;
          }
        } else {
          formattedComment += ` * ${sanitizedLine}\n`;
        }
      }
    });

    formattedComment += ' */\n';

    this.editor.executeEdits('ai-response', [
      {
        range: new monaco.Range(position.lineNumber, 1, position.lineNumber, 1),
        text: formattedComment,
        forceMoveMarkers: true,
      },
    ]);

    const newCursorOffset = lineStartOffset + formattedComment.length;
    const newPosition = model.getPositionAt(newCursorOffset);
    this.editor.setPosition(newPosition);
    this.editor.focus();
  }

  async showAssistant(errorContext?: TabExecutionError) {
    if (this.assistantZoneId) return;

    if (this.structuredZoneId) {
      this.hideStructuredResponse();
    }

    const cursorPosition = this.editor.getPosition();
    if (!cursorPosition) return;

    let dom: HTMLElement;
    try {
      dom = await this.buildAssistantDom(errorContext);
    } catch (error) {
      logError('Failed to build widget DOM', error);
      return;
    }

    this.addInteractiveZone(cursorPosition.lineNumber, dom, 'assistant');
    this.notifyVisibility();

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const textarea = dom.querySelector(
          UI_SELECTORS.TEXTAREA,
        ) as HTMLTextAreaElement | null;
        textarea?.focus();
      });
    });
  }

  hideAssistant() {
    if (!this.assistantZoneId) return;
    if (this.activeRequest) return;

    const zoneId = this.assistantZoneId;
    this.assistantZoneId = null;
    this.removeZone(zoneId);
    this.clearResizeObserver('assistant');
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = undefined;
    }
    this.notifyVisibility();
    this.editor.focus();
  }

  showStructuredResponse(response: StructuredSQLResponse) {
    // Force hide assistant zone - bypass activeRequest guard since we're replacing it
    if (this.assistantZoneId) {
      const zoneId = this.assistantZoneId;
      this.assistantZoneId = null;
      this.removeZone(zoneId);
      this.clearResizeObserver('assistant');
      if (this.cleanup) {
        this.cleanup();
        this.cleanup = undefined;
      }
    }

    const position = this.editor.getPosition();
    if (!position) return;

    const widget = new StructuredResponseWidget(
      this.buildAdapter(),
      response,
      () => {
        this.hideStructuredResponse();
      },
    );

    const dom = widget.toDOM();
    this.addInteractiveZone(position.lineNumber, dom, 'structured');
    this.structuredCleanup = () => widget.destroy();

    this.notifyVisibility();
  }

  hideStructuredResponse() {
    if (!this.structuredZoneId) return;

    const zoneId = this.structuredZoneId;
    this.structuredZoneId = null;
    this.removeZone(zoneId);
    this.clearResizeObserver('structured');
    if (this.structuredCleanup) {
      this.structuredCleanup();
      this.structuredCleanup = undefined;
    }
    this.notifyVisibility();
    this.editor.focus();
  }

  isVisible(): boolean {
    return Boolean(this.assistantZoneId || this.structuredZoneId);
  }

  isAssistantVisible(): boolean {
    return Boolean(this.assistantZoneId);
  }

  isStructuredVisible(): boolean {
    return Boolean(this.structuredZoneId);
  }

  dispose() {
    // Abort any in-flight request before tearing down widgets
    this.abortController?.abort();
    this.abortController = null;
    this.activeRequest = false;

    this.hideAssistant();
    this.hideStructuredResponse();
  }
}

const managerMap = new WeakMap<monaco.editor.IStandaloneCodeEditor, MonacoAIAssistantManager>();

export function registerAIAssistant(
  editor: monaco.editor.IStandaloneCodeEditor,
  options: AIAssistantManagerOptions,
): monaco.IDisposable {
  if (managerMap.has(editor)) {
    return managerMap.get(editor)!;
  }

  const manager = new MonacoAIAssistantManager(editor, options);
  managerMap.set(editor, manager);

  return manager;
}

export async function showAIAssistant(
  editor: monaco.editor.IStandaloneCodeEditor,
  errorContext?: TabExecutionError,
) {
  const manager = managerMap.get(editor);
  if (manager) {
    await manager.showAssistant(errorContext);
  }
}

export function hideAIAssistant(editor: monaco.editor.IStandaloneCodeEditor) {
  const manager = managerMap.get(editor);
  if (manager) {
    manager.hideAssistant();
    manager.hideStructuredResponse();
  }
}

export function isAIAssistantVisible(editor: monaco.editor.IStandaloneCodeEditor): boolean {
  const manager = managerMap.get(editor);
  return manager ? manager.isVisible() : false;
}
