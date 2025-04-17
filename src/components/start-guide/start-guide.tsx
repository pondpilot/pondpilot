import { Center, Stack, Text } from '@mantine/core';
import { useOs } from '@mantine/hooks';
import { useOsModifierIcon } from '@hooks/use-os-modifier-icon';

export const StartGuide = () => {
  const os = useOs();
  const isMacOS = os === 'macos';
  const mod = useOsModifierIcon();
  console.log('StartGuide');

  const shortcustList = [
    {
      key: `${mod.command} K`,
      shortcut: [isMacOS ? '⌘' : 'Ctrl', 'K'],
      description: 'Go to view or query',
    },
  ];
  return (
    <Center h="100%">
      <Stack>
        <Stack align="center" gap={2}>
          <Text className="text-3xl">🚀</Text>
          <Text fw={500} c="text-primary" className="text-2xl">
            Select data object to start analysis
          </Text>
          {shortcustList.map((item) => (
            <Text key={item.key} fw={500} c="text-secondary" className="text-base" ta="center">
              {item.description} {item.shortcut.join(' ')}
            </Text>
          ))}
        </Stack>
      </Stack>
    </Center>
  );
};
