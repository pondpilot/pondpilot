import duckLogoDark from '@assets/duck-dark.svg';
import duckLogo from '@assets/duck.svg';
import { HotkeyPill } from '@components/hotkey-pill';
import { SpotlightMenu } from '@components/spotlight';
import { WHATS_NEW_MODAL_OPTIONS, WhatsNewModal } from '@features/whats-new-modal';
import { useOsModifierIcon } from '@hooks/use-os-modifier-icon';
import { Group, Text, TextInput, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { spotlight } from '@mantine/spotlight';
import { IconSearch } from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';
import { memo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export const Header = memo(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const mod = useOsModifierIcon();
  const isSettingsPage = location.pathname.includes('settings');

  const logoSection = isSettingsPage ? (
    <Group className="gap-2">
      <Text component="button" onClick={() => navigate('/')} size="xs" c="text-secondary">
        HOME
      </Text>
      <Text size="xs">/</Text>
      <Text size="xs">SETTINGS</Text>
    </Group>
  ) : (
    <Group
      className="gap-3 cursor-pointer hover:opacity-80 transition-opacity"
      onClick={() => navigate('/')}
    >
      <Tooltip label="Hi, I'm Polly!" position="bottom" openDelay={500}>
        <div>
          <img src={duckLogo} alt="PondPilot" className="w-8 h-8 dark:hidden" />
          <img src={duckLogoDark} alt="PondPilot" className="w-8 h-8 hidden dark:block" />
        </div>
      </Tooltip>
      <Group gap={4} align="baseline">
        <Text size="lg" fw={600} className="text-textPrimary-light dark:text-textPrimary-dark">
          PondPilot
        </Text>
        <Tooltip label="Release Notes" position="bottom" openDelay={500}>
          <Text
            size="xs"
            c="text-secondary"
            className="font-mono cursor-pointer hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              const modalId = modals.open({
                ...WHATS_NEW_MODAL_OPTIONS,
                children: <WhatsNewModal onClose={() => modals.close(modalId)} />,
              });
            }}
          >
            {__VERSION__}
          </Text>
        </Tooltip>
      </Group>
    </Group>
  );

  return (
    <>
      <SpotlightMenu />
      <Group justify="space-between" className="h-full">
        <Group gap={40} flex={1}>
          {logoSection}
        </Group>

        <TextInput
          flex={1}
          data-testid={setDataTestId('spotlight-trigger-input')}
          className="cursor-pointer max-w-[400px] min-w-[300px]"
          classNames={{
            input: cn(
              'bg-backgroundSecondary-light  border-0 placeholder-textSecondary-light  h-[38px] rounded-full ',
              'dark:bg-backgroundSecondary-dark dark:placeholder-textSecondary-dark',
            ),
          }}
          readOnly
          leftSection={
            <Group gap={4} onClick={spotlight.open}>
              <IconSearch size={20} className="dark:text-iconDefault-dark text-iconDefault-light" />{' '}
              <Text c="text-secondary" className="text-sm">
                Search
              </Text>
            </Group>
          }
          leftSectionProps={{ onClick: spotlight.open }}
          rightSectionProps={{
            onClick: spotlight.open,
            className: 'w-auto pr-1',
          }}
          rightSectionWidth={74}
          leftSectionWidth={100}
          rightSection={<HotkeyPill value={[mod.command, 'K']} />}
          pointer
          onClick={(e) => {
            e.stopPropagation();
            spotlight.open();
          }}
        />

        <Group flex={1} justify="end" gap={8}>
          {/* // TODO: Implement this */}
          {/* <ActionIcon size={20} disabled>
          <IconLayoutSidebarFilled />
        </ActionIcon>
        <ActionIcon size={20} disabled>
          <IconLayoutBottombarFilled />
        </ActionIcon>
        <Divider orientation="vertical" />
          <ActionIcon size={20} disabled>
            <IconLayout />
          </ActionIcon> */}
        </Group>
      </Group>
    </>
  );
});
