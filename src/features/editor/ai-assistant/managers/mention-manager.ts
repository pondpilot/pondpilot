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
import { announceToScreenReader } from '../ui-factories';
import { createCleanupRegistry, CleanupRegistry } from '../utils/cleanup-registry';

export class MentionManager {
  private mentionState: MentionState;
  private mentionDropdown: HTMLElement | null = null;
  private debounceTimer: number | null = null;
  private currentRequestId = 0;
  private textarea: HTMLTextAreaElement;
  private generateBtn: HTMLButtonElement;
  private services: AIAssistantServices;
  private cleanupRegistry: CleanupRegistry;

  constructor(
    textarea: HTMLTextAreaElement,
    generateBtn: HTMLButtonElement,
    services: AIAssistantServices,
  ) {
    this.textarea = textarea;
    this.generateBtn = generateBtn;
    this.services = services;
    this.mentionState = createInitialMentionState();
    this.cleanupRegistry = createCleanupRegistry();
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

      // Increment request ID for this new search
      this.currentRequestId += 1;
      const requestId = this.currentRequestId;

      if (trigger.query === '') {
        await this.debouncedFetchSuggestions(trigger.query, requestId);
      } else {
        this.debounceTimer = window.setTimeout(() => {
          this.debouncedFetchSuggestions(trigger.query, requestId);
          this.debounceTimer = null;
        }, MENTION_AUTOCOMPLETE.DEBOUNCE_DELAY_MS);
      }
    } else {
      if (this.debounceTimer !== null) {
        window.clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }
      // Cancel any pending requests when mention is deactivated
      this.currentRequestId += 1;
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

      // Announce selected suggestion to screen readers
      const selectedSuggestion = this.mentionState.suggestions[this.mentionState.selectedIndex];
      if (selectedSuggestion && selectedSuggestion.type !== 'error') {
        const suggestionText = selectedSuggestion.contextInfo
          ? `${selectedSuggestion.label} in ${selectedSuggestion.contextInfo}`
          : selectedSuggestion.label;
        announceToScreenReader({
          message: `${suggestionText}, ${this.mentionState.selectedIndex + 1} of ${this.mentionState.suggestions.length}`,
          priority: 'polite',
        });
      }

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

      // Announce selected suggestion to screen readers
      const selectedSuggestion = this.mentionState.suggestions[this.mentionState.selectedIndex];
      if (selectedSuggestion && selectedSuggestion.type !== 'error') {
        const suggestionText = selectedSuggestion.contextInfo
          ? `${selectedSuggestion.label} in ${selectedSuggestion.contextInfo}`
          : selectedSuggestion.label;
        announceToScreenReader({
          message: `${suggestionText}, ${this.mentionState.selectedIndex + 1} of ${this.mentionState.suggestions.length}`,
          priority: 'polite',
        });
      }

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
    // Cancel any pending requests
    this.currentRequestId += 1;

    if (this.mentionDropdown) {
      cleanupMentionDropdown(this.mentionDropdown);
      this.mentionDropdown = null;
    }

    // Dispose the cleanup registry which will clear timeouts
    this.cleanupRegistry.dispose();
    this.debounceTimer = null;
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
      this.textarea.setAttribute('aria-expanded', 'false');
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
      this.textarea.setAttribute('aria-expanded', 'true');

      const selectedOptionId = `ai-mention-option-${this.mentionState.selectedIndex}`;
      this.textarea.setAttribute('aria-activedescendant', selectedOptionId);

      // Announce dropdown state to screen readers
      const suggestionCount = this.mentionState.suggestions.length;
      const announcement =
        suggestionCount === 1
          ? '1 suggestion available. Use arrow keys to navigate.'
          : `${suggestionCount} suggestions available. Use arrow keys to navigate.`;

      announceToScreenReader({
        message: announcement,
        priority: 'polite',
      });
    }
  }

  private async debouncedFetchSuggestions(query: string, requestId: number): Promise<void> {
    const suggestions = await getTableSuggestions(
      this.services.connectionPool,
      query,
      this.services.sqlScripts,
    );
    // Only update if this is still the most recent request
    if (requestId === this.currentRequestId && this.mentionState.isActive) {
      this.mentionState.suggestions = suggestions;
      this.mentionState.selectedIndex = 0;
      this.updateMentionDropdown();
    }
  }
}
