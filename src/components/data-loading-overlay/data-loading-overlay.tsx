import { HotkeyPill } from '@components/hotkey-pill';
import { LoadingOverlay } from '@components/loading-overlay';
import { useOsModifierIcon } from '@hooks/use-os-modifier-icon';
import { Stack, Loader, Button, Text, Group } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';

interface DataLoadingOverlayProps {
  title: string;
  onCancel: () => void;
  visible: boolean;
}

export const DataLoadingOverlay = ({ onCancel, visible, title }: DataLoadingOverlayProps) => {
  const { option } = useOsModifierIcon();

  useHotkeys([
    [
      'Alt+Q',
      () => {
        if (visible) {
          onCancel();
        }
      },
    ],
  ]);

  return (
    <LoadingOverlay visible={visible}>
      <Stack align="center" gap={4} bg="background-primary" className="p-8 pt-4 rounded-2xl">
        <Loader size={24} color="text-secondary" />
        <Text c="text-primary" className="text-2xl font-medium">
          {title}
        </Text>
        <span className="text-textSecondary-light dark:text-textSecondary-dark font-medium">
          Press{' '}
          <Group align="center" className="inline-flex">
            <Button onClick={onCancel}>Cancel</Button> or{' '}
            <HotkeyPill variant="secondary" value={[option, 'Q']} />
          </Group>{' '}
          to abort processing
        </span>
      </Stack>
    </LoadingOverlay>
  );
};
