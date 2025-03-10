import { useAppStore } from '@store/app-store';

export const AppStatus = () => {
  const appStatus = useAppStore((state) => state.appStatus);
  return <div data-app-ready={appStatus === 'ready'} style={{ display: 'none' }} />;
};
