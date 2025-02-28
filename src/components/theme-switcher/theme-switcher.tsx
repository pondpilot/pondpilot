import { ActionIcon, useMantineColorScheme } from '@mantine/core';
import { IconMoon, IconSunHigh } from '@tabler/icons-react';

export const ThemeSwitcher = () => {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  return (
    <ActionIcon size={20} onClick={() => toggleColorScheme()} title="Toggle color scheme">
      {colorScheme === 'dark' ? <IconSunHigh /> : <IconMoon />}
    </ActionIcon>
  );
};
