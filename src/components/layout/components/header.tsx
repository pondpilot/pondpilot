import { memo } from 'react';
import { ActionIcon, Group, Text, TextInput, useMantineColorScheme } from '@mantine/core';
import { spotlight } from '@mantine/spotlight';
import { cn } from '@utils/ui/styles';
import { IconLayout, IconSearch } from '@tabler/icons-react';
import { HotkeyPill } from '@components/hotkey-pill';
import { useModifier } from 'hooks/useModifier';
import Logo from '../../../assets/logo.svg?react';
import DarkLogo from '../../../assets/dark-logo.svg?react';

export const Header = memo(() => {
  const { colorScheme } = useMantineColorScheme();

  const mod = useModifier();

  return (
    <Group justify="space-between" className="h-full">
      <Group gap={40} w={150}>
        <Text size="xl">{colorScheme === 'dark' ? <DarkLogo /> : <Logo />}</Text>
      </Group>
      <Group>
        <TextInput
          className="cursor-pointer"
          classNames={{
            input: cn(
              'bg-backgroundSecondary-light  border-0 placeholder-textSecondary-light w-[460px] h-[38px] rounded-full ',
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
          rightSectionProps={{ onClick: spotlight.open }}
          rightSectionWidth={74}
          leftSectionWidth={100}
          rightSection={<HotkeyPill value={[mod.command, 'K']} />}
          pointer
          onClick={(e) => {
            e.stopPropagation();
            spotlight.open();
          }}
        />
      </Group>
      <Group w={150} justify="end" gap={8}>
        {/* <ActionIcon size={20} disabled>
          <IconLayoutSidebarFilled />
        </ActionIcon>
        <ActionIcon size={20} disabled>
          <IconLayoutBottombarFilled />
        </ActionIcon>
        <Divider orientation="vertical" /> */}
        <ActionIcon size={20} disabled>
          <IconLayout />
        </ActionIcon>
      </Group>
    </Group>
  );
});
