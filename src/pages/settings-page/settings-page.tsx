import { Box, Group, Stack, Text, Title } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { useNavigate } from 'react-router-dom';
import { ThemeSwitcher } from './components/theme-switcher';

export const SettingsPage = () => {
  const navigate = useNavigate();

  useHotkeys([['Escape', () => navigate('/')]]);

  return (
    <Group align="start" justify="center" className="h-full p-4">
      <Box w={300}></Box>
      <Stack w={700} className="gap-8">
        <Title c="text-primary" order={2}>
          Appearance
        </Title>
        <Stack>
          <Box>
            <Title c="text-primary" order={3}>
              Theme
            </Title>
            <Text c="text-secondary">
              Choose how WAT looks to you. Select a single theme, or sync with your system and
              automatically switch between day and night themes. Selections are applied immediately
              and saved automatically.
            </Text>
          </Box>

          <ThemeSwitcher />
        </Stack>
        <Stack className="gap-8">
          <Title c="text-primary" order={2}>
            Reset
          </Title>
          <Stack>
            <Box>
              <Title c="text-primary" order={3}>
                Reset all settings
              </Title>
              <Text c="text-secondary">
                Reset all settings to their default values. This includes all appearance settings,
                and any other settings you have changed.
              </Text>
            </Box>
          </Stack>
        </Stack>
      </Stack>
    </Group>
  );
};
