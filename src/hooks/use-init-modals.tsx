import { ONBOARDING_MODAL_OPTIONS, OnboardingModal } from '@components/onboarding-modal';
import { LOCAL_STORAGE_KEYS } from '@consts/local-storage';
import { useDidUpdate, useLocalStorage } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { useAppStore } from '@store/app-store';

export const useInitModals = () => {
  const appLoadState = useAppStore.use.appLoadState();

  const [isOnboardingShown, setIsOnboardingShown] = useLocalStorage({
    key: LOCAL_STORAGE_KEYS.ONBOARDING_SHOWN,
    defaultValue: false,
  });

  const [whatsNewVersionShown, setWhatsNewVersionShown] = useLocalStorage({
    key: LOCAL_STORAGE_KEYS.WHATS_NEW_VERSION_SHOWN,
  });

  useDidUpdate(() => {
    if (appLoadState === 'ready') {
      // If a user is using the app for the first time, show the Onboarding modal, not the Release Notes
      if (!isOnboardingShown) {
        setWhatsNewVersionShown(__VERSION__);

        const modalId = modals.open({
          ...ONBOARDING_MODAL_OPTIONS,
          onClose: () => setIsOnboardingShown(true),
          children: <OnboardingModal onClose={() => modals.close(modalId)} />,
        });
        return;
      }

      // if (whatsNewVersionShown && isVersionGreater(__VERSION__, whatsNewVersionShown)) {
      //   const modalId = modals.open({
      //     ...WHATS_NEW_MODAL_OPTIONS,
      //     onClose: () => setWhatsNewVersionShown(__VERSION__),
      //     children: <WhatsNewModal onClose={() => modals.close(modalId)} />,
      //   });
      //   return;
      // }
      // Set the current version by default
      setWhatsNewVersionShown(__VERSION__);
    }
  }, [appLoadState]);
};
