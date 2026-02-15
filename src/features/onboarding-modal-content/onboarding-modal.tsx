import duckDark from '@assets/duck-dark.svg';
import duck from '@assets/duck.svg';
import { useAppTheme } from '@hooks/use-app-theme';
import { Box, Button, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { ModalSettings } from '@mantine/modals/lib/context';
import {
  IconBolt,
  IconBrain,
  IconFileDatabase,
  IconLock,
  IconRefresh,
  IconRocket,
} from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';

const features = [
  {
    icon: IconLock,
    title: 'Privacy First',
    description: 'All processing happens in your browser. Your data never leaves your device.',
  },
  {
    icon: IconBolt,
    title: 'Powered by DuckDB',
    description: 'Lightning-fast SQL engine for analyzing millions of rows in seconds.',
  },
  {
    icon: IconBrain,
    title: 'AI SQL Assistant',
    description: 'Generate complex SQL queries from plain English descriptions.',
  },
  {
    icon: IconFileDatabase,
    title: 'Multiple Formats',
    description: 'CSV, Parquet, JSON, XLSX, DuckDB databases and more — all supported.',
  },
  {
    icon: IconRocket,
    title: 'Zero Setup',
    description: 'No install needed. Open the app and start querying — it just works.',
  },
  {
    icon: IconRefresh,
    title: 'Persistent Sessions',
    description: 'Your queries and data handles are saved automatically across sessions.',
  },
];

export const ONBOARDING_MODAL_OPTIONS: ModalSettings = {
  size: 680,
  withCloseButton: true,
};

export const OnboardingModalContent = ({ onClose }: { onClose: () => void }) => {
  const colorScheme = useAppTheme();

  return (
    <Stack gap={24} data-testid={setDataTestId('onboarding-modal')}>
      <Stack justify="center" align="center" gap={8}>
        <img
          src={colorScheme === 'dark' ? duckDark : duck}
          alt="PondPilot"
          width={51}
          height={42}
          style={{ display: 'block' }}
        />
        <Title order={2}>Welcome to PondPilot</Title>
        <Text c="text-secondary" ta="center">
          Query and transform your data — effortlessly.
        </Text>
      </Stack>

      <SimpleGrid cols={2} spacing={12}>
        {features.map((feature) => (
          <Group
            key={feature.title}
            align="flex-start"
            gap={12}
            wrap="nowrap"
            className="rounded-xl bg-transparent004-light p-3 dark:bg-transparent004-dark"
          >
            <Box
              className="flex shrink-0 items-center justify-center rounded-lg bg-transparent008-light dark:bg-transparent008-dark"
              w={36}
              h={36}
            >
              <feature.icon
                size={20}
                stroke={1.5}
                className="text-iconAccent-light dark:text-iconAccent-dark"
              />
            </Box>
            <Stack gap={2}>
              <Text fw={500} size="body2">
                {feature.title}
              </Text>
              <Text c="text-secondary" size="xs" lh={1.4}>
                {feature.description}
              </Text>
            </Stack>
          </Group>
        ))}
      </SimpleGrid>

      <Group justify="end">
        <Button onClick={onClose} data-testid={setDataTestId('onboarding-modal-submit-button')}>
          Get Started
        </Button>
      </Group>
    </Stack>
  );
};
