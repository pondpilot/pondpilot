import { Badge, Box, Group, Stack, Text, Title } from '@mantine/core';

import { SettingsSection as SettingsSectionType } from '../settings.types';

interface SettingsSectionProps extends SettingsSectionType {}

export const SettingsSection = ({
  id,
  title,
  description,
  component: Component,
  badge,
}: SettingsSectionProps) => {
  return (
    <Stack id={id} gap={16}>
      <Box>
        <Group>
          <Title c="text-primary" order={3}>
            {title}
          </Title>
          {badge && (
            <Badge color={badge.color} variant={badge.variant}>
              {badge.text}
            </Badge>
          )}
        </Group>

        {description && (
          <Text c="text-secondary" size="sm">
            {description}
          </Text>
        )}
      </Box>

      <Component />
    </Stack>
  );
};
