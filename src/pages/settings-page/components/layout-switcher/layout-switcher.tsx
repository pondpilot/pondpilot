import { SegmentedControl, Stack, Text, Group } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconLayoutSidebar, IconMenu2 } from '@tabler/icons-react';

export const LayoutSwitcher = () => {
  const [useAccordionLayout, setUseAccordionLayout] = useLocalStorage<boolean>({
    key: 'navbar-accordion-layout',
    defaultValue: false,
  });

  return (
    <Stack gap="xs">
      <SegmentedControl
        value={useAccordionLayout ? 'accordion' : 'classic'}
        onChange={(value) => setUseAccordionLayout(value === 'accordion')}
        data={[
          {
            value: 'classic',
            label: (
              <Group gap="xs">
                <IconLayoutSidebar size={16} />
                <span>Classic</span>
              </Group>
            ),
          },
          {
            value: 'accordion',
            label: (
              <Group gap="xs">
                <IconMenu2 size={16} />
                <span>Accordion</span>
              </Group>
            ),
          },
        ]}
      />
      <Text size="xs" c="dimmed">
        {useAccordionLayout
          ? 'Sections can be collapsed/expanded independently'
          : 'Sections can be resized by dragging the divider'}
      </Text>
    </Stack>
  );
};
