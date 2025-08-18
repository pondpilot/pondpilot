import { Stack, Text, Box } from '@mantine/core';
import { cn } from '@utils/ui/styles';

interface NavigationItem {
  id: string;
  label: string;
}

interface SettingsNavigationProps {
  navigationItems: NavigationItem[];
  activeSection: string;
  onSectionClick: (sectionId: string) => void;
}

export const SettingsNavigation = ({
  navigationItems,
  activeSection,
  onSectionClick,
}: SettingsNavigationProps) => {
  return (
    <Box component="aside" className="w-64 flex-shrink-0 p-4" visibleFrom="md">
      <Stack className="gap-2">
        {navigationItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSectionClick(item.id)}
            className={cn(
              'w-full px-3 py-2 text-left rounded-full transition-colors duration-200',
              activeSection === item.id
                ? 'bg-backgroundAccent-light dark:bg-backgroundAccent-dark hover:bg-accentHover-light dark:hover:bg-accentHover-dark active:bg-accentActive-light dark:active:bg-accentActive-dark'
                : 'hover:bg-backgroundTertiary-light dark:hover:bg-backgroundTertiary-dark',
            )}
          >
            <Text c={activeSection === item.id ? 'text-contrast' : 'text-secondary'} size="sm">
              {item.label}
            </Text>
          </button>
        ))}
      </Stack>
    </Box>
  );
};
