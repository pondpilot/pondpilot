import { useAppContext } from '@features/app-context';
import {
  ONBOARDING_MODAL_OPTIONS,
  OnboardingModalContent,
} from '@features/onboarding-modal-content';
import { WHATS_NEW_MODAL_OPTIONS, WhatsNewModal } from '@features/whats-new-modal';
import { useDidUpdate, useLocalStorage } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { LOCAL_STORAGE_KEYS } from '@models/local-storage';
import { useAppStore } from '@store/app-store';
import { isVersionGreater } from '@utils/compare-versions';

export const InitModals = () => {
  const {
    browserInfo: { isFileAccessApiSupported },
  } = useAppContext();
  const appLoadState = useAppStore.use.appLoadState();

  const [isOnboardingShown, setIsOnboardingShown] = useLocalStorage({
    key: LOCAL_STORAGE_KEYS.ONBOARDING_SHOWN,
    defaultValue: false,
  });

  const [whatsNewVersionShown, setWhatsNewVersionShown] = useLocalStorage({
    key: LOCAL_STORAGE_KEYS.WHATS_NEW_VERSION_SHOWN,
  });

  useDidUpdate(() => {
    if (!isFileAccessApiSupported) {
      return;
    }
    if (appLoadState === 'ready') {
      // If a user is using the app for the first time, show the Onboarding modal
      if (!isOnboardingShown) {
        setWhatsNewVersionShown(__VERSION__);

        const modalId = modals.open({
          ...ONBOARDING_MODAL_OPTIONS,
          onClose: () => setIsOnboardingShown(true),
          children: <OnboardingModalContent onClose={() => modals.close(modalId)} />,
        });
      }

      if (whatsNewVersionShown && isVersionGreater(__VERSION__, whatsNewVersionShown)) {
        const modalId = modals.open({
          ...WHATS_NEW_MODAL_OPTIONS,
          onClose: () => setWhatsNewVersionShown(__VERSION__),
          children: <WhatsNewModal onClose={() => modals.close(modalId)} />,
        });
        return;
      }
      // Set the current version by default
      setWhatsNewVersionShown(__VERSION__);
    }
  }, [appLoadState]);

  return null;
};
