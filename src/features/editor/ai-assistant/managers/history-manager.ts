import { getPromptHistoryManager } from '../prompt-history';

export class HistoryNavigationManager {
  private currentHistoryIndex = -1;
  private tempCurrentInput = '';
  private textarea: HTMLTextAreaElement;
  private historyManager = getPromptHistoryManager();

  constructor(textarea: HTMLTextAreaElement) {
    this.textarea = textarea;
  }

  resetHistory(): void {
    this.currentHistoryIndex = -1;
    this.tempCurrentInput = '';
  }

  handleNavigation(event: KeyboardEvent): boolean {
    const historyItems = this.historyManager.getHistory();

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();

      if (this.currentHistoryIndex < historyItems.length - 1) {
        if (this.currentHistoryIndex === -1 && this.textarea.value.trim()) {
          this.tempCurrentInput = this.textarea.value;
        }
        this.currentHistoryIndex += 1;
        const historicalPrompt = this.historyManager.getPromptAtIndex(this.currentHistoryIndex);
        if (historicalPrompt) {
          this.textarea.value = historicalPrompt;
          this.textarea.setSelectionRange(this.textarea.value.length, this.textarea.value.length);
          // Trigger resize after setting value
          this.triggerTextareaResize();
        }
      }
      return true;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();

      if (this.currentHistoryIndex > -1) {
        this.currentHistoryIndex -= 1;
        if (this.currentHistoryIndex === -1) {
          this.textarea.value = this.tempCurrentInput || '';
        } else {
          const historicalPrompt = this.historyManager.getPromptAtIndex(this.currentHistoryIndex);
          if (historicalPrompt) {
            this.textarea.value = historicalPrompt;
          }
        }
        this.textarea.setSelectionRange(this.textarea.value.length, this.textarea.value.length);
        // Trigger resize after setting value
        this.triggerTextareaResize();
      }
      return true;
    }

    return false;
  }

  private triggerTextareaResize(): void {
    // Manually trigger the auto-resize functionality
    this.textarea.style.height = 'auto';
    this.textarea.style.height = `${Math.min(this.textarea.scrollHeight, 120)}px`;
  }

  // Reset history index on any manual input (not just on submit)
  handleManualInput(): void {
    this.resetHistory();
  }
}
