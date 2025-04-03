import { useInitStore } from '@store/init-store';
import { setDataTestId } from '@utils/test-id';

export const AppState = () => {
  const appLoadState = useInitStore.use.appLoadState();
  return (
    <div
      data-testid={setDataTestId('app-state')}
      data-app-load-state={appLoadState}
      style={{ display: 'none' }}
    />
  );
};
