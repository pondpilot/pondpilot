import { isTauriEnvironment } from '@utils/browser';
import { useMemo } from 'react';

export function useIsTauri(): boolean {
  return useMemo(() => isTauriEnvironment(), []);
}
