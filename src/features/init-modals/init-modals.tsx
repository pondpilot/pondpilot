import { showAlert } from '@components/app-notifications';
import { useFeatureContext } from '@features/feature-context';
import {
  ONBOARDING_MODAL_OPTIONS,
  OnboardingModalContent,
} from '@features/onboarding-modal-content';
import { WHATS_NEW_MODAL_OPTIONS, WhatsNewModal } from '@features/whats-new-modal';
import { Button, Group, Stack, Text } from '@mantine/core';
import { useDidUpdate, useLocalStorage } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { LOCAL_STORAGE_KEYS } from '@models/local-storage';
import { useAppStore } from '@store/app-store';
import { isVersionGreater } from '@utils/compare-versions';
import { setDataTestId } from '@utils/test-id';

export const InitModals = () => {
  const { isFileAccessApiSupported, isMobileDevice } = useFeatureContext();
  const appLoadState = useAppStore.use.appLoadState();

  const [isOnboardingShown, setIsOnboardingShown] = useLocalStorage({
    key: LOCAL_STORAGE_KEYS.ONBOARDING_SHOWN,
    defaultValue: false,
  });

  const [whatsNewVersionShown, setWhatsNewVersionShown] = useLocalStorage({
    key: LOCAL_STORAGE_KEYS.WHATS_NEW_VERSION_SHOWN,
  });

  const setCurrentVersion = () => {
    setWhatsNewVersionShown(__VERSION__);
  };

  useDidUpdate(() => {
    if (!isFileAccessApiSupported || isMobileDevice) {
      return;
    }
    if (appLoadState === 'ready') {
      // If a user is using the app for the first time, show the Onboarding modal
      if (!isOnboardingShown) {
        setCurrentVersion();

        const modalId = modals.open({
          ...ONBOARDING_MODAL_OPTIONS,
          onClose: () => setIsOnboardingShown(true),
          children: <OnboardingModalContent onClose={() => modals.close(modalId)} />,
        });
      }

      if (whatsNewVersionShown && isVersionGreater(__VERSION__, whatsNewVersionShown)) {
        const newVersionAlert = showAlert({
          title: 'New version! New goodies!',
          onClose: setCurrentVersion,
          closeButtonProps: {
            'data-testid': setDataTestId('new-version-alert-close-button'),
          },
          message: (
            <Stack data-testid={setDataTestId('new-version-alert')}>
              <Text c="text-tertiary">
                We&apos;ve just rolled out some improvements and fresh features. Want to see
                what&apos;s new?
              </Text>
              <Group justify="end" gap={0}>
                <Button
                  variant="transparent"
                  c="text-tertiary"
                  data-testid={setDataTestId('new-version-alert-cancel-button')}
                  onClick={() => {
                    notifications.hide(newVersionAlert);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  color="background-accent"
                  data-testid={setDataTestId('new-version-alert-open-button')}
                  onClick={async () => {
                    notifications.hide(newVersionAlert);
                    const modalId = modals.open({
                      ...WHATS_NEW_MODAL_OPTIONS,
                      onClose: setCurrentVersion,
                      children: <WhatsNewModal onClose={() => modals.close(modalId)} />,
                    });
                  }}
                >
                  Read Release Notes
                </Button>
              </Group>
            </Stack>
          ),
          autoClose: false,
        });

        return;
      }
      // Set the current version by default
      setCurrentVersion();
    }
  }, [appLoadState]);

  return null;
};
