import { ONBOARDING_MODAL_OPTIONS, OnboardingModal } from '@components/onboarding-modal';
import { LOCAL_STORAGE_KEYS } from '@consts/local-storage';
import { useAppContext } from '@features/app-context';
import { useDidUpdate, useLocalStorage } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { useAppStore } from '@store/app-store';

export const InitModals = () => {
  const {
    browserInfo: { isFileAccessApiSupported },
  } = useAppContext();
  const appLoadState = useAppStore.use.appLoadState();

  const [isOnboardingShown, setIsOnboardingShown] = useLocalStorage({
    key: LOCAL_STORAGE_KEYS.ONBOARDING_SHOWN,
    defaultValue: false,
  });

  useDidUpdate(() => {
    if (!isFileAccessApiSupported) {
      return;
    }
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

  return null;
};
