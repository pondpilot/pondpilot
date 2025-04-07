import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { ContextModalProps } from '@mantine/modals';
import PlugSVG from './plug.svg?react';

export const ONBOARDING_MODAL_OPTIONS = {
  modal: 'onboarding',
  centered: true,
  size: 675,
  radius: 'md',
  withCloseButton: true,
  closeOnClickOutside: false,
  closeOnEscape: false,
  innerProps: {},
};

export const OnboardingModal = ({ context, id }: ContextModalProps) => (
  <Stack gap={16}>
    <Stack justify="center" align="center" gap={4}>
      <Title order={1}>👋 Welcome to PondPilod</Title>
      <Text c="text-secondary">Query and transform your data - effortlessly.</Text>
    </Stack>
    <Stack justify="center" align="center" gap={4}>
      {/* // TODO: Render video here */}
      <PlugSVG />
    </Stack>
    <Group justify="end" mt={60}>
      <Button onClick={() => context.closeModal(id)} color="background-accent">
        Got it!
      </Button>
    </Group>
  </Stack>
);
