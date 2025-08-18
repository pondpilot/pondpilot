import { DatabaseManagementSettings } from '@components/database-management/database-management-settings';

import { AISettings } from './components/ai-settings';
import { EditorSettings } from './components/editor-settings';
import { ClearDataSection } from './components/sections/clear-data-section';
import { ExportQueriesSection } from './components/sections/export-queries-section';
import { ThemeSwitcher } from './components/theme-switcher';
import { SettingsConfig } from './settings.types';

export const settingsConfig: SettingsConfig = {
  blocks: [
    {
      id: 'appearance',
      title: 'Appearance',
      sections: [
        {
          id: 'theme',
          title: 'Theme',
          description: 'Customize how the app looks. Choose a theme or sync with your system.',
          component: ThemeSwitcher,
        },
        {
          id: 'editor-font',
          title: 'SQL Editor Font',
          description: 'Adjust the SQL editor font size and style.',
          component: EditorSettings,
        },
      ],
    },
    {
      id: 'ai-assistant',
      title: 'AI Assistant',
      sections: [
        {
          id: 'ai-config',
          title: 'AI Assistant',
          description: 'Configure your AI assistant provider and model.',
          component: AISettings,
        },
      ],
    },
    {
      id: 'saved-data',
      title: 'Saved Data',
      sections: [
        {
          id: 'export-queries',
          title: 'Export queries',
          description: 'Export all queries to a single ZIP archive.',
          component: ExportQueriesSection,
        },
        {
          id: 'database-storage',
          title: 'Database Storage',
          badge: {
            text: 'Persistent',
            color: 'green',
            variant: 'light',
          },
          component: DatabaseManagementSettings,
        },
        {
          id: 'clear-data',
          title: 'Clear app data',
          description:
            'This action will permanently delete all saved queries and uploaded files. This cannot be undone.',
          component: ClearDataSection,
        },
      ],
    },
  ],
};

// Generate navigation items from config
export const getNavigationItems = () => {
  return settingsConfig.blocks.map((block) => ({
    id: block.id,
    label: block.title,
  }));
};
