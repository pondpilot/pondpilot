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

  useDidUpdate(() => {
    if (appLoadState === 'ready') {
      // If a user is using the app for the first time, show the Onboarding modal
      if (!isOnboardingShown) {
        const modalId = modals.open({
          ...ONBOARDING_MODAL_OPTIONS,
          onClose: () => setIsOnboardingShown(true),
          children: <OnboardingModal onClose={() => modals.close(modalId)} />,
        });
      }
    }
  }, [appLoadState]);
};
