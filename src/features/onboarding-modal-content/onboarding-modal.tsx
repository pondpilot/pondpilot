import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { ModalSettings } from '@mantine/modals/lib/context';
import { setDataTestId } from '@utils/test-id';
import { YT_ONBOARDING_EMBED_URL } from '@models/app-urls';

export const ONBOARDING_MODAL_OPTIONS: ModalSettings = {
  size: 800,
  withCloseButton: true,
};

export const OnboardingModalContent = ({ onClose }: { onClose: () => void }) => (
  <Stack gap={32} data-testid={setDataTestId('onboarding-modal')}>
    <Stack justify="center" align="center" gap={4}>
      <Title order={1}>👋 Welcome to PondPilot</Title>
      <Text c="text-secondary">Query and transform your data - effortlessly.</Text>
    </Stack>
    <Stack justify="center" align="center" gap={4}>
      <iframe
        width="700"
        height="400"
        src={YT_ONBOARDING_EMBED_URL}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title="PondPilot Onboarding"
      />
    </Stack>
    <Group justify="end" mt={24}>
      <Button
        onClick={onClose}
        color="background-accent"
        data-testid={setDataTestId('onboarding-modal-submit-button')}
      >
        Got it!
      </Button>
    </Group>
  </Stack>
);
