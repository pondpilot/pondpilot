import { aiWidgetBaseTheme } from './ai-widget-base';
import { aiWidgetContextTheme } from './ai-widget-context';
import { aiWidgetInputTheme } from './ai-widget-input';
import { structuredResponseTheme } from './structured-response';

// Combined AI assistant theme that merges all theme modules
export const aiAssistantTheme = [
  aiWidgetBaseTheme,
  aiWidgetContextTheme,
  aiWidgetInputTheme,
  structuredResponseTheme,
];

// Export individual themes for granular usage if needed
export { aiWidgetBaseTheme, aiWidgetContextTheme, aiWidgetInputTheme, structuredResponseTheme };
