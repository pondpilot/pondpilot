import { Stack, Text, UnstyledButton } from '@mantine/core';
import { ReactNode } from 'react';

interface BaseActionCardProps {
  onClick: () => void | Promise<void>;
  icon: ReactNode;
  title: string;
  description: string;
  className?: string;
}

export function BaseActionCard({
  onClick,
  icon,
  title,
  description,
  className,
}: BaseActionCardProps) {
  return (
    <UnstyledButton
      onClick={onClick}
      className={`flex flex-col items-center justify-center p-6 rounded-lg border border-borderPrimary-light dark:border-borderPrimary-dark hover:border-borderAccent-light dark:hover:border-borderAccent-dark hover:bg-transparentBrandBlue-012 dark:hover:bg-transparent004-dark transition-all duration-200 cursor-pointer h-40 ${className || ''}`}
    >
      <Stack align="center" gap={12}>
        {icon}
        <Stack gap={4} align="center">
          <Text fw={500} size="sm" c="text-primary">
            {title}
          </Text>
          <Text size="xs" c="text-secondary" ta="center">
            {description}
          </Text>
        </Stack>
      </Stack>
    </UnstyledButton>
  );
}
