import { memo } from 'react';
import { Group, Text, TextInput } from '@mantine/core';
import { spotlight } from '@mantine/spotlight';
import { cn } from '@utils/ui/styles';
import { IconSearch } from '@tabler/icons-react';
import { HotkeyPill } from '@components/hotkey-pill';
import { useOsModifierIcon } from '@hooks/use-os-modifier-icon';
import { SpotlightMenu } from '@components/spotlight';
import { useLocation, useNavigate } from 'react-router-dom';
import { setDataTestId } from '@utils/test-id';

export const Header = memo(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const mod = useOsModifierIcon();
  const isSettingsPage = location.pathname.includes('settings');

  const logoPlaceholder = isSettingsPage ? (
    <Group className="gap-2">
      <Text component="button" onClick={() => navigate('/')} size="xs" c="text-secondary">
        HOME
      </Text>
      <Text size="xs">/</Text>
      <Text size="xs">SETTINGS</Text>
    </Group>
  ) : (
    <></>
    // TODO: Implement this
    // <ActionIcon size={20} disabled>
    //   <IconLayoutSidebar />
    // </ActionIcon>
  );

  return (
    <>
      <SpotlightMenu />
      <Group justify="space-between" className="h-full">
        <Group gap={40} flex={1}>
          {logoPlaceholder}
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
