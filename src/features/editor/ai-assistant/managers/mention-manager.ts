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

      // If no selection (from mouse scroll), start at -1 so next will be 0
      if (this.mentionState.selectedIndex === -1) {
        this.mentionState.selectedIndex = 0;
      } else {
        this.mentionState.selectedIndex =
          (this.mentionState.selectedIndex + 1) % this.mentionState.suggestions.length;
      }
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

      // If no selection (from mouse scroll), start at the last item
      if (this.mentionState.selectedIndex === -1) {
        this.mentionState.selectedIndex = this.mentionState.suggestions.length - 1;
      } else {
        this.mentionState.selectedIndex =
          this.mentionState.selectedIndex === 0
            ? this.mentionState.suggestions.length - 1
            : this.mentionState.selectedIndex - 1;
      }
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

        // If no selection (from mouse scroll), select the first item
        if (this.mentionState.selectedIndex === -1) {
          this.mentionState.selectedIndex = 0;
        }

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

  private applyMentionSuggestion(suggestion: {
    value: string;
    type?: string;
    contextInfo?: string;
  }): void {
    const { value } = this.textarea;
    const start = Math.min(this.mentionState.startPos, value.length);
    const end = Math.min(this.mentionState.endPos, value.length);

    // Use fully qualified name for tables and views if context info is available
    let insertValue = suggestion.value;
    if ((suggestion.type === 'table' || suggestion.type === 'view') && suggestion.contextInfo) {
      // contextInfo contains "database.schema", so we combine it with the table name
      insertValue = `${suggestion.contextInfo}.${suggestion.value}`;
    }

    const newValue = `${value.substring(0, start)}@${insertValue} ${value.substring(end)}`;
    this.textarea.value = newValue;

    const newCursorPos = start + 1 + insertValue.length + 1;
    this.textarea.setSelectionRange(newCursorPos, newCursorPos);

    this.mentionState = createInitialMentionState();
    this.updateMentionDropdown();
    this.textarea.focus();
  }

  private async updateMentionDropdown(): Promise<void> {
    const shouldShowDropdown =
      this.mentionState.isActive && this.mentionState.suggestions.length > 0;

    // Update generate button state
    this.generateBtn.disabled = shouldShowDropdown;

    // If we need to hide the dropdown
    if (!shouldShowDropdown) {
      if (this.mentionDropdown) {
        cleanupMentionDropdown(this.mentionDropdown);
        this.mentionDropdown = null;
        this.textarea.removeAttribute('aria-controls');
        this.textarea.removeAttribute('aria-autocomplete');
        this.textarea.removeAttribute('aria-activedescendant');
        this.textarea.setAttribute('aria-expanded', 'false');
      }
      return;
    }

    // Always recreate the dropdown when suggestions change to ensure click handlers are correct
    // Only update selection if we're just navigating (not typing)
    if (this.mentionDropdown) {
      // Check if suggestions have changed by comparing lengths or content
      const dropdownItems = this.mentionDropdown.querySelectorAll('.ai-widget-mention-item');
      const suggestionsChanged = dropdownItems.length !== this.mentionState.suggestions.length;

      if (!suggestionsChanged) {
        // Just update the selection if suggestions haven't changed
        this.updateDropdownSelection();
        return;
      }

      // Clean up old dropdown before creating new one
      cleanupMentionDropdown(this.mentionDropdown);
      this.mentionDropdown = null;
    }

    // Create new dropdown
    this.mentionDropdown = createMentionDropdown(
      this.mentionState.suggestions,
      this.mentionState.selectedIndex,
      (suggestion) => {
        this.applyMentionSuggestion(suggestion);
      },
      this.textarea,
      (newIndex) => {
        // Update the selected index when scrolling with mouse
        this.mentionState.selectedIndex = newIndex;
      },
    );

    document.body.appendChild(this.mentionDropdown);

    this.textarea.setAttribute('aria-controls', this.mentionDropdown.id);
    this.textarea.setAttribute('aria-autocomplete', 'list');
    this.textarea.setAttribute('aria-expanded', 'true');

    if (this.mentionState.selectedIndex >= 0) {
      const selectedOptionId = `ai-mention-option-${this.mentionState.selectedIndex}`;
      this.textarea.setAttribute('aria-activedescendant', selectedOptionId);
    } else {
      this.textarea.removeAttribute('aria-activedescendant');
    }

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

  private updateDropdownSelection(): void {
    if (!this.mentionDropdown) return;

    // Update aria attributes
    if (this.mentionState.selectedIndex >= 0) {
      const selectedOptionId = `ai-mention-option-${this.mentionState.selectedIndex}`;
      this.textarea.setAttribute('aria-activedescendant', selectedOptionId);
    } else {
      this.textarea.removeAttribute('aria-activedescendant');
    }

    // Update visual selection
    const items = this.mentionDropdown.querySelectorAll('.ai-widget-mention-item');
    const isDarkMode =
      document.documentElement.getAttribute('data-mantine-color-scheme') === 'dark';

    items.forEach((item, index) => {
      const htmlItem = item as HTMLElement;
      const isSelected = index === this.mentionState.selectedIndex;

      if (isSelected) {
        item.classList.add('selected');
        item.setAttribute('aria-selected', 'true');
        // Update inline styles for selected state
        htmlItem.style.backgroundColor = isDarkMode ? '#29324C' : '#E0E2F4';

        // Update icon color for selected state
        const icon = htmlItem.querySelector('.ai-widget-mention-icon') as HTMLElement;
        if (icon) {
          icon.style.color = isDarkMode ? '#A8B3C4' : '#6F7785';
        }

        // Ensure the selected item is visible without smooth scrolling
        htmlItem.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      } else {
        item.classList.remove('selected');
        item.setAttribute('aria-selected', 'false');
        // Always reset background when not selected during keyboard navigation
        // This prevents double selection appearance when mouse hovers
        htmlItem.style.backgroundColor = 'transparent';

        // Reset icon color
        const icon = htmlItem.querySelector('.ai-widget-mention-icon') as HTMLElement;
        if (icon) {
          icon.style.color = isDarkMode ? '#A8B3C4' : '#6F7785';
        }
      }
    });
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
