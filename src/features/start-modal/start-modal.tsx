import { ONBOARDING_MODAL_OPTIONS } from '@components/onboarding-modal';
import { WHATS_NEW_MODAL_OPTIONS } from '@components/whats-new-modal';
import { LOCAL_STORAGE_KEYS } from '@consts/local-storage';
import { useDidUpdate, useLocalStorage } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { useAppStore } from '@store/app-store';
import { isVersionGreater } from '@utils/compare-versions';

export const StartModal = () => {
  const appStatus = useAppStore((state) => state.appStatus);

  const [isOnboardingShown, setIsOnboardingShown] = useLocalStorage({
    key: LOCAL_STORAGE_KEYS.ONBOARDING_SHOWN,
    defaultValue: false,
  });

  const [whatsNewVersionShown, setWhatsNewVersionShown] = useLocalStorage({
    key: LOCAL_STORAGE_KEYS.WHATS_NEW_VERSION_SHOWN,
  });

  useDidUpdate(() => {
    if (appStatus === 'ready') {
      // If a user is using the app for the first time, show the Onboarding modal, not the Release Notes
      if (!isOnboardingShown) {
        setWhatsNewVersionShown(__VERSION__);
        modals.openContextModal({
          ...ONBOARDING_MODAL_OPTIONS,
          innerProps: {
            isOnboardingShown: String(isOnboardingShown),
          },
          onClose() {
            setIsOnboardingShown(true);
          },
        });
        return;
      }

      if (whatsNewVersionShown && isVersionGreater(__VERSION__, whatsNewVersionShown)) {
        modals.openContextModal({
          ...WHATS_NEW_MODAL_OPTIONS,
          onClose() {
            setWhatsNewVersionShown(__VERSION__);
          },
        });
        return;
      }
      // Set the current version by dfault
      setWhatsNewVersionShown(__VERSION__);
    }
  }, [appStatus]);

  return null;
};
