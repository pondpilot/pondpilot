import { Stack, Title } from '@mantine/core';

import { SettingsBlock as SettingsBlockType } from '../settings.types';
import { SettingsSection } from './settings-section';

interface SettingsBlockProps extends SettingsBlockType {}

export const SettingsBlock = ({ id, title, sections }: SettingsBlockProps) => {
  return (
    <Stack id={id} gap={32}>
      <Title c="text-primary" order={2}>
        {title}
      </Title>

      <Stack gap={32}>
        {sections.map((section) => (
          <SettingsSection key={section.id} {...section} />
        ))}
      </Stack>
    </Stack>
  );
};
