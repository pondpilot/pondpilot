import { Box, Button, Divider, Group, Stack, Text, Title } from '@mantine/core';
import { clearFileSystem } from '@components/settings-modal/utils';
import { useAppContext } from '@features/app-context';
import { ThemeSwitcher } from './components/theme-switcher';

export const SettingsPage = () => {
  const { exportFilesAsArchive } = useAppContext();

  // TODO: Separate this into a hook
  const handleClearData = async () => {
    await clearFileSystem();
  };

  const downloadArchive = async () => {
    const archiveBlob = await exportFilesAsArchive();
    if (archiveBlob) {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(archiveBlob);
      link.download = 'queries.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

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
        <Divider />
        <Stack className="gap-8">
          <Title c="text-primary" order={2}>
            Saved data
          </Title>
          <Stack>
            <Box>
              <Title c="text-primary" order={3}>
                Export queries
              </Title>
              <Stack>
                <Text c="text-secondary">Export all queries to a single ZIP archive.</Text>
                <Button
                  className="w-fit"
                  onClick={downloadArchive}
                  variant="outline"
                  color="background-accent"
                >
                  Export All
                </Button>
              </Stack>
            </Box>
          </Stack>
          <Stack>
            <Box>
              <Title c="text-primary" order={3}>
                Clear app data
              </Title>
              <Stack>
                <Text c="text-secondary">
                  This action will permanently delete all saved queries and uploaded files. It
                  cannot be undone.
                </Text>
                <Button className="w-fit" onClick={handleClearData} variant="outline" color="red">
                  Clear all
                </Button>
              </Stack>
            </Box>
          </Stack>
        </Stack>
      </Stack>
    </Group>
  );
};
