import { DBPersistenceController } from '@controllers/db-persistence';
import { DevModal } from '@features/app-context/components/dev-modal';
import {
  DuckDBConnectionPoolProvider,
  DuckDBInitializerStatusContext,
} from '@features/duckdb-context/duckdb-context';
import { useFeatureContext } from '@features/feature-context';
import { DBPersistenceState } from '@models/db-persistence';
import { OPFSUtil } from '@utils/opfs';
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

// Context for managing persistence UI state
interface UIStateContextType {
  isShowingPersistenceUI: boolean;
}

export const PersistenceUIContext = createContext<UIStateContextType>({
  isShowingPersistenceUI: false,
});

// Hook to access persistence UI state
export const usePersistenceUI = (): UIStateContextType => {
  return useContext(PersistenceUIContext);
};

// The interval at which we poll the database size (in ms)
const DB_SIZE_POLL_INTERVAL = 60000; // 1 minute

interface DuckDBPersistenceContextType {
  persistenceController: DBPersistenceController | null;
  persistenceState: DBPersistenceState;
  isPersistenceSupported: boolean;
  isInitialized: boolean;
  exportDatabase: () => Promise<void>;
  clearDatabase: () => Promise<void>;
  importDatabase: (file: File) => Promise<boolean>;
  updatePersistenceState: () => Promise<void>;
}

const DuckDBPersistenceContext = createContext<DuckDBPersistenceContextType | null>(null);

export const useDuckDBPersistence = (): DuckDBPersistenceContextType => {
  const context = useContext(DuckDBPersistenceContext);
  if (!context) {
    throw new Error('useDuckDBPersistence must be used within a DuckDBPersistenceProvider');
  }
  return context;
};

// Main persistence connector for the app
export const PersistenceConnector: React.FC<{
  maxPoolSize: number;
  children: React.ReactNode;
}> = ({ maxPoolSize, children }) => {
  // No local ready state; combinedStatus tracks overall readiness
  // Track a combined initialization state for a unified loading experience
  const [combinedStatus, setCombinedStatus] = useState<{
    state: 'none' | 'loading' | 'ready' | 'error';
    message: string;
    phase: 'persistence' | 'duckdb';
  }>({
    state: 'loading',
    message: 'Initializing database storage...',
    phase: 'persistence',
  });

  // Create a UI state value to inform other components we're showing the UI
  const uiContextValue = useMemo(
    () => ({ isShowingPersistenceUI: combinedStatus.state !== 'ready' }),
    [combinedStatus.state],
  );

  // Handler to update the combined status
  // Using useCallback to prevent recreating this function on each render
  const handleStatusUpdate = useCallback(
    (
      status: { state: 'none' | 'loading' | 'ready' | 'error'; message: string },
      phase: 'persistence' | 'duckdb',
    ) => {
      // Prevent unnecessary updates by checking if status actually changed
      setCombinedStatus((prevStatus) => {
        // Only update if something changed to avoid infinite loops
        if (
          prevStatus.state !== status.state ||
          prevStatus.message !== status.message ||
          prevStatus.phase !== phase
        ) {
          return {
            ...status,
            phase,
          };
        }
        return prevStatus;
      });
    },
    [],
  );

  // Memoize the callback functions to prevent re-renders
  const handlePersistenceStatus = useCallback(
    (status: { state: 'none' | 'loading' | 'ready' | 'error'; message: string }) => {
      handleStatusUpdate(status, 'persistence');
    },
    [handleStatusUpdate],
  );

  const handleDuckDBStatus = useCallback(
    (status: { state: 'none' | 'loading' | 'ready' | 'error'; message: string }) => {
      handleStatusUpdate(status, 'duckdb');
    },
    [handleStatusUpdate],
  );

  // Memoize the context value to prevent unnecessary re-renders
  const statusContextValue = useMemo(() => combinedStatus, [combinedStatus]);

  return (
    <PersistenceUIContext.Provider value={uiContextValue}>
      <DuckDBPersistenceProvider onStatusUpdate={handlePersistenceStatus}>
        {/* Provide combined status to DevModal */}
        <DuckDBInitializerStatusContext.Provider value={statusContextValue}>
          {import.meta.env.DEV && <DevModal />}
          {/* DuckDBConnectionPoolProvider manages actual DuckDB initialization */}
          <DuckDBConnectionPoolProvider
            maxPoolSize={maxPoolSize}
            onStatusUpdate={handleDuckDBStatus}
          >
            {children}
          </DuckDBConnectionPoolProvider>
        </DuckDBInitializerStatusContext.Provider>
      </DuckDBPersistenceProvider>
    </PersistenceUIContext.Provider>
  );
};

export const DuckDBPersistenceProvider: React.FC<{
  children: React.ReactNode;
  onStatusUpdate?: (status: {
    state: 'none' | 'loading' | 'ready' | 'error';
    message: string;
  }) => void;
}> = ({ children, onStatusUpdate }) => {
  const { isOPFSSupported } = useFeatureContext();

  // Memoize the onStatusUpdate function to prevent infinite loops
  const memoizedStatusUpdate = useCallback(
    (status: { state: 'none' | 'loading' | 'ready' | 'error'; message: string }) => {
      onStatusUpdate?.(status);
    },
    [onStatusUpdate],
  );
  const [controller, setController] = useState<DBPersistenceController | null>(null);
  const [persistenceState, setPersistenceState] = useState<DBPersistenceState>({
    mode: 'persistent',
    dbPath: 'opfs://pondpilot.db',
    dbSize: 0,
    lastSync: null,
  });
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      memoizedStatusUpdate({
        state: 'loading',
        message: 'Preparing database storage...',
      });

      if (!isOPFSSupported) {
        // OPFS not supported, cannot proceed
        memoizedStatusUpdate({
          state: 'error',
          message: 'Persistent storage is not supported in this browser',
        });
        setIsInitialized(true); // Mark as initialized even though it failed
        return;
      }

      try {
        memoizedStatusUpdate({
          state: 'loading',
          message: 'Initializing file system...',
        });

        const opfsUtil = new OPFSUtil();

        // Pre-initialize the OPFS database file to prevent file handle issues
        try {
          // Explicitly create the handle for the database file if it doesn't exist
          await opfsUtil.getFileHandle('pondpilot.db', true);

          memoizedStatusUpdate({
            state: 'loading',
            message: 'Preparing database file...',
          });
        } catch (handleError) {
          console.error('Error creating database file handle:', handleError);
          memoizedStatusUpdate({
            state: 'error',
            message: 'Failed to create database file handle',
          });
          throw handleError;
        }

        const persistenceController = new DBPersistenceController(opfsUtil);

        memoizedStatusUpdate({
          state: 'loading',
          message: 'Initializing database controller...',
        });

        const state = await persistenceController.initialize();

        setController(persistenceController);
        setPersistenceState(state);

        memoizedStatusUpdate({
          state: 'loading',
          message: 'Database storage ready, initializing database...',
        });

        setIsInitialized(true); // Mark as initialized after successful setup
      } catch (error) {
        // Critical error - persistence is required
        console.error('Critical error initializing persistence:', error);
        memoizedStatusUpdate({
          state: 'error',
          message: `Failed to initialize database storage: ${error instanceof Error ? error.message : String(error)}`,
        });
        setIsInitialized(true); // Mark as initialized even though it failed
      }
    };

    init();
  }, [isOPFSSupported, memoizedStatusUpdate]);

  const updatePersistenceState = async () => {
    if (!controller) return;

    try {
      const updatedState = await controller.updateLastSync();
      setPersistenceState(updatedState);
    } catch (error) {
      console.error('Failed to update persistence state:', error);
    }
  };

  // Periodically update the database size
  useEffect(() => {
    if (!controller) return;

    const updateDBSize = async () => {
      await updatePersistenceState();
    };

    updateDBSize();

    const interval = setInterval(updateDBSize, DB_SIZE_POLL_INTERVAL);

    return () => {
      clearInterval(interval);
    };
  }, [controller]);

  const exportDatabase = async (): Promise<void> => {
    if (!controller) return;

    const data = await controller.exportDB();
    if (!data) {
      console.error('Failed to export database');
      return;
    }

    // Create a download
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const fileName = `pondpilot-db-${timestamp}.db`;

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';

    document.body.appendChild(a);
    a.click();

    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const clearDatabase = async (): Promise<void> => {
    if (!controller) return;

    const success = await controller.clearDB();
    if (success) {
      // Update the state
      setPersistenceState((prevState) => ({
        ...prevState,
        dbSize: 0,
        lastSync: null,
      }));
    }
  };

  const importDatabase = async (file: File): Promise<boolean> => {
    if (!controller) return false;

    try {
      const data = await file.arrayBuffer();
      const success = await controller.importDB(data);

      if (success) {
        // Update the state
        setPersistenceState((prevState) => ({
          ...prevState,
          dbSize: data.byteLength,
          lastSync: new Date(),
        }));
      }

      return success;
    } catch (error) {
      console.error('Failed to import database:', error);
      return false;
    }
  };

  return (
    <DuckDBPersistenceContext.Provider
      value={{
        persistenceController: controller,
        persistenceState,
        isPersistenceSupported: isOPFSSupported,
        isInitialized,
        exportDatabase,
        clearDatabase,
        importDatabase,
        updatePersistenceState,
      }}
    >
      {children}
    </DuckDBPersistenceContext.Provider>
  );
};
