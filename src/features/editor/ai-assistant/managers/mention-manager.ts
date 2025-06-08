import { MENTION_AUTOCOMPLETE } from '../constants';
import {
  createInitialMentionState,
  detectMentionTrigger,
  getTableSuggestions,
  createMentionDropdown,
  cleanupMentionDropdown,
  MentionState,
} from '../mention-autocomplete';
import { AIAssistantServices } from '../services-facet';

export class MentionManager {
  private mentionState: MentionState;
  private mentionDropdown: HTMLElement | null = null;
  private debounceTimer: number | null = null;
  private textarea: HTMLTextAreaElement;
  private generateBtn: HTMLButtonElement;
  private services: AIAssistantServices;

  constructor(
    textarea: HTMLTextAreaElement,
    generateBtn: HTMLButtonElement,
    services: AIAssistantServices,
  ) {
    this.textarea = textarea;
    this.generateBtn = generateBtn;
    this.services = services;
    this.mentionState = createInitialMentionState();
  }

  get state(): MentionState {
    return this.mentionState;
  }

  async handleInput(resetHistoryCallback: () => void): Promise<void> {
    const cursorPos = this.textarea.selectionStart;
    const text = this.textarea.value;

    resetHistoryCallback();

    const trigger = detectMentionTrigger(text, cursorPos);

    if (trigger.isTriggered) {
      this.mentionState.isActive = true;
      this.mentionState.query = trigger.query;
      this.mentionState.startPos = trigger.startPos;
      this.mentionState.endPos = cursorPos;

      if (this.debounceTimer !== null) {
        window.clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }

      if (trigger.query === '') {
        await this.debouncedFetchSuggestions(trigger.query);
      } else {
        this.debounceTimer = window.setTimeout(() => {
          this.debouncedFetchSuggestions(trigger.query);
          this.debounceTimer = null;
        }, MENTION_AUTOCOMPLETE.DEBOUNCE_DELAY_MS);
      }
    } else {
      if (this.debounceTimer !== null) {
        window.clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      this.mentionState = createInitialMentionState();
      this.updateMentionDropdown();
    }
  }

  handleNavigation(event: KeyboardEvent): boolean {
    if (!this.mentionState.isActive || this.mentionState.suggestions.length === 0) {
      return false;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      this.mentionState.selectedIndex =
        (this.mentionState.selectedIndex + 1) % this.mentionState.suggestions.length;
      this.textarea.setAttribute(
        'aria-activedescendant',
        `ai-mention-option-${this.mentionState.selectedIndex}`,
      );
      this.updateMentionDropdown();
      return true;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      this.mentionState.selectedIndex =
        this.mentionState.selectedIndex === 0
          ? this.mentionState.suggestions.length - 1
          : this.mentionState.selectedIndex - 1;
      this.textarea.setAttribute(
        'aria-activedescendant',
        `ai-mention-option-${this.mentionState.selectedIndex}`,
      );
      this.updateMentionDropdown();
      return true;
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      if (!event.shiftKey && this.mentionState.suggestions.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        const suggestion = this.mentionState.suggestions[this.mentionState.selectedIndex];
        if (suggestion && suggestion.type !== 'error') {
          this.applyMentionSuggestion(suggestion);
        }
        return true;
      }
    } else if (event.key === 'Escape') {
      if (this.mentionState.isActive) {
        event.preventDefault();
        event.stopPropagation();
        this.mentionState = createInitialMentionState();
        this.updateMentionDropdown();
        return true;
      }
    }

    return false;
  }

  cleanup(): void {
    if (this.mentionDropdown) {
      cleanupMentionDropdown(this.mentionDropdown);
      this.mentionDropdown = null;
    }
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private applyMentionSuggestion(suggestion: { value: string }): void {
    const { value } = this.textarea;
    const start = Math.min(this.mentionState.startPos, value.length);
    const end = Math.min(this.mentionState.endPos, value.length);

    const newValue = `${value.substring(0, start)}@${suggestion.value} ${value.substring(end)}`;
    this.textarea.value = newValue;

    const newCursorPos = start + 1 + suggestion.value.length + 1;
    this.textarea.setSelectionRange(newCursorPos, newCursorPos);

    this.mentionState = createInitialMentionState();
    this.updateMentionDropdown();
    this.textarea.focus();
  }

  private async updateMentionDropdown(): Promise<void> {
    if (this.mentionDropdown) {
      cleanupMentionDropdown(this.mentionDropdown);
      this.mentionDropdown = null;
      this.textarea.removeAttribute('aria-controls');
      this.textarea.removeAttribute('aria-autocomplete');
      this.textarea.removeAttribute('aria-activedescendant');
    }

    this.generateBtn.disabled =
      this.mentionState.isActive && this.mentionState.suggestions.length > 0;

    if (this.mentionState.isActive && this.mentionState.suggestions.length > 0) {
      this.mentionDropdown = createMentionDropdown(
        this.mentionState.suggestions,
        this.mentionState.selectedIndex,
        (suggestion) => {
          this.applyMentionSuggestion(suggestion);
        },
        this.textarea,
      );

      document.body.appendChild(this.mentionDropdown);

      this.textarea.setAttribute('aria-controls', this.mentionDropdown.id);
      this.textarea.setAttribute('aria-autocomplete', 'list');

      const selectedOptionId = `ai-mention-option-${this.mentionState.selectedIndex}`;
      this.textarea.setAttribute('aria-activedescendant', selectedOptionId);
    }
  }

  private async debouncedFetchSuggestions(query: string): Promise<void> {
    const suggestions = await getTableSuggestions(
      this.services.connectionPool,
      query,
      this.services.sqlScripts,
    );
    if (this.mentionState.isActive && this.mentionState.query === query) {
      this.mentionState.suggestions = suggestions;
      this.mentionState.selectedIndex = 0;
      this.updateMentionDropdown();
    }
  }
}
