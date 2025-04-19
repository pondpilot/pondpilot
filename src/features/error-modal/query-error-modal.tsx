import { Group, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconCircleXFilled } from '@tabler/icons-react';

export const openQueryErrorModal = (errorText: string): string =>
  modals.open({
    size: 'lg',
    centered: true,
    closeOnClickOutside: false,
    closeOnEscape: false,
    withCloseButton: true,
    classNames: {
      content: 'rounded-lg',
      body: 'px-[52px]',
    },
    title: (
      <Group className="gap-3">
        <IconCircleXFilled className="text-magenta-700" />
        <Text c="text-primary" className="font-medium">
          Failed to run query
        </Text>
      </Group>
    ),
    children: (
      <Text size="xs" mb="md" className="font-mono">
        <pre className="whitespace-pre-wrap">{errorText}</pre>
      </Text>
    ),
  });
