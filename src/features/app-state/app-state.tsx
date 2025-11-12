import { useAppStore } from '@store/app-store';
import { setDataTestId } from '@utils/test-id';

export const AppState = () => {
  const appLoadState = useAppStore.use.appLoadState();
  return (
    <div
      data-testid={setDataTestId('app-state')}
      data-app-load-state={appLoadState}
      style={{ display: 'none' }}
      className="app-state"
    />
  );
};
