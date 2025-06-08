import { aiWidgetBaseTheme } from './ai-widget-base';
import { aiWidgetContextTheme } from './ai-widget-context';
import { aiWidgetInputTheme } from './ai-widget-input';
import { mentionDropdownTheme } from './mention-dropdown';
import { structuredResponseTheme } from './structured-response';

// Combined AI assistant theme that merges all theme modules
export const aiAssistantTheme = [
  aiWidgetBaseTheme,
  aiWidgetContextTheme,
  aiWidgetInputTheme,
  structuredResponseTheme,
  mentionDropdownTheme,
];

// Export individual themes for granular usage if needed
export {
  aiWidgetBaseTheme,
  aiWidgetContextTheme,
  aiWidgetInputTheme,
  structuredResponseTheme,
  mentionDropdownTheme,
};
