import { ONBOARDING_MODAL_OPTIONS } from '@components/onboarding-modal';
import { useDidUpdate, useLocalStorage } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { useAppStore } from '@store/app-store';

export const StartModal = () => {
  const appStatus = useAppStore((state) => state.appStatus);

  const [isOnboardingShown, setIsOnboardingShown] = useLocalStorage({
    key: 'onboarding-shown',
    defaultValue: false,
  });

  const [whatsNewVersionShown, setWhatsNewVersionShown] = useLocalStorage({
    key: 'whats-new-version-shown',
  });

  useDidUpdate(() => {
    if (appStatus === 'ready') {
      // if (isOnboardingShown && __VERSION__ !== whatsNewVersionShown) {
      //   modals.openContextModal({
      //     ...WHATS_NEW_MODAL_OPTIONS,
      //     onClose() {
      //       setWhatsNewVersionShown(__VERSION__);
      //     },
      //   });
      // }

      if (!isOnboardingShown) {
        //  TODO:  need for tests setWhatsNewVersionShown(__VERSION__);
        modals.openContextModal({
          ...ONBOARDING_MODAL_OPTIONS,
          onClose() {
            setIsOnboardingShown(true);
          },
        });
      }
    }
  }, [appStatus]);
  return null;
};
