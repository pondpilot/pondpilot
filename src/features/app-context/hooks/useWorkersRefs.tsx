import { Remote } from 'comlink';
import { useRef } from 'react';

import { SessionWorker } from '../app-session-worker';
import { DBWorkerAPIType } from '../models';

export const useWorkersRefs = () => {
  /**
   * File system access API worker
   */
  const workerRef = useRef<Worker | null>(null);
  const dbWorkerRef = useRef<Worker | null>(null);

  /**
   * Database worker proxy
   */
  const proxyRef = useRef<Remote<SessionWorker> | null>(null);
  const dbProxyRef = useRef<Remote<DBWorkerAPIType> | null>(null);

  return { workerRef, dbWorkerRef, proxyRef, dbProxyRef };
};
