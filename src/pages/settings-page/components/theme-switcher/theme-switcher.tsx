import { Box, Divider, Group, Stack, Title, useMantineColorScheme } from '@mantine/core';
import React from 'react';

import { cn } from '@utils/ui/styles';

interface ThemeItemProps {
  theme: string;
  title: string;
  active: boolean;

  onClick: () => void;
}

const ThemeItem = ({ theme, title, onClick, active }: ThemeItemProps) => {
  const bgColor = `bg-backgroundPrimary-${theme}`;
  const tertiaryColor = `bg-backgroundTertiary-${theme}`;
  const accentColor = `bg-backgroundAccent-${theme}`;
  const borderColor = cn(
    'border-borderPrimary-light dark:border-borderPrimary-dark',
    active && 'border-borderAccent-light dark:border-borderAccent-dark',
  );

  return (
    <Stack className="gap-1">
      <Title c="text-primary" order={5}>
        {title}
      </Title>
      <Box
        className={cn(
          'p-6 rounded-[32px] border  cursor-pointer hover:opacity-90 transition-opacity',
          bgColor,
          borderColor,
        )}
        onClick={onClick}
      >
        <Stack className="w-[150px] h-[72px] gap-3">
          <Group>
            <div className={`size-3 ${tertiaryColor} rounded`} />
            <div className={`size-3 w-24 ${tertiaryColor} rounded`} />
          </Group>
          <Group>
            <div className={`size-3 ${tertiaryColor} rounded`} />
            <div className={`size-3 w-28 ${tertiaryColor} rounded`} />
          </Group>
          <div className={`size-3 w-12 ${accentColor} rounded mt-auto`} />
        </Stack>
      </Box>
    </Stack>
  );
};

interface SystemThemeProps {
  active: boolean;

  onClick: () => void;
}

const SystemTheme = ({ onClick, active }: SystemThemeProps) => (
  <Stack className="gap-1">
    <Title c="text-primary" order={5}>
      System
    </Title>
    <Group
      className={cn(
        'rounded-[32px] overflow-hidden border border-borderPrimary-light dark:border-borderPrimary-dark gap-0 cursor-pointer hover:opacity-90 transition-opacity',
        active && 'border-borderAccent-light dark:border-borderAccent-dark',
      )}
      onClick={onClick}
    >
      <Stack className="gap-3 bg-backgroundPrimary-light p-6 pr-4 flex-nowrap">
        <Group className="w-[60px]">
          <div className="size-3 bg-backgroundTertiary-light rounded" />
          <div className="size-3 w-5 bg-backgroundTertiary-light rounded" />
        </Group>
        <Group>
          <div className="size-3 bg-backgroundTertiary-light rounded" />
          <div className="size-3 w-5 bg-backgroundTertiary-light rounded" />
        </Group>
        <div className="size-3 w-5 bg-backgroundAccent-light rounded mt-3" />
      </Stack>
      <Divider orientation="vertical" />
      <Stack className="gap-3 bg-backgroundPrimary-dark p-6 pl-4 flex-nowrap">
        <Group className="w-[60px]">
          <div className="size-3 bg-backgroundTertiary-dark rounded" />
          <div className="size-3 w-5 bg-backgroundTertiary-dark rounded" />
        </Group>
        <Group>
          <div className="size-3 bg-backgroundTertiary-dark rounded" />
          <div className="size-3 w-5 bg-backgroundTertiary-dark rounded" />
        </Group>
        <div className="size-3 w-5 bg-backgroundAccent-dark rounded mt-3" />
      </Stack>
    </Group>
  </Stack>
);

export const ThemeSwitcher = () => {
  const { setColorScheme, colorScheme } = useMantineColorScheme();

  const handleLightClick = () => setColorScheme('light');
  const handleDarkClick = () => setColorScheme('dark');
  const handleSystemClick = () => setColorScheme('auto');

  return (
    <Group className="gap-6">
      <ThemeItem
        active={colorScheme === 'light'}
        theme="light"
        title="Light"
        onClick={handleLightClick}
      />
      <ThemeItem
        active={colorScheme === 'dark'}
        theme="dark"
        title="Dark"
        onClick={handleDarkClick}
      />
      <SystemTheme active={colorScheme === 'auto'} onClick={handleSystemClick} />
    </Group>
  );
};
