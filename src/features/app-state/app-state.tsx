import { useInitStore } from '@store/init-store';
import { setDataTestId } from '@utils/test-id';

export const AppState = () => {
  const appLoadState = useInitStore((state) => state.appLoadState);
  return (
    <div
      data-testid={setDataTestId('app-state')}
      data-app-load-state={appLoadState}
      style={{ display: 'none' }}
    />
  );
};
