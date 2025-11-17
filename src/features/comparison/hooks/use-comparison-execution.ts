import { setComparisonPendingResultsTable } from '@controllers/comparison/comparison-controller';
import { dropComparisonResultsTable } from '@controllers/comparison/table-utils';
import { ConnectionPool } from '@engines/types';
import {
  COMPARISON_EXECUTION_STAGE,
  ComparisonExecutionProgress,
  ComparisonExecutionStage,
  ComparisonId,
} from '@models/comparison';
import { ComparisonConfig, SchemaComparisonResult } from '@models/tab';
import {
  clearComparisonExecutionProgress,
  markComparisonCancelRequested,
  updateComparisonExecutionProgress,
  useAppStore,
} from '@store/app-store';
import {
  setComparisonExecutionMetadata,
  setComparisonPartialResults,
} from '@store/comparison-metadata';
import { getComparisonResultsTableName } from '@utils/comparison';
import { useState, useCallback, useRef } from 'react';

import {
  AlgorithmContext,
  AlgorithmProgressUpdate,
  AlgorithmExecutionMetrics,
  ComparisonAlgorithm,
  selectAlgorithm,
} from '../algorithms';
import { MIN_PROGRESS_UPDATE_INTERVAL_MS } from '../config/execution-config';
import { validateComparisonConfig } from '../utils/sql-generator';

/**
 * Creates a default progress object for fallback scenarios
 */
const createDefaultProgress = (
  stage: ComparisonExecutionStage,
  error?: string,
): ComparisonExecutionProgress => {
  const now = Date.now();
  return {
    stage,
    startedAt: now,
    updatedAt: now,
    completedBuckets: 0,
    pendingBuckets: 0,
    totalBuckets: 0,
    processedRows: 0,
    diffRows: 0,
    currentBucket: null,
    cancelRequested: false,
    supportsFinishEarly: false,
    ...(error && { error }),
  };
};

/**
 * Per-comparison state for throttled progress updates
 */
interface ThrottledProgressState {
  lastUpdateTime: number;
  pendingUpdate: AlgorithmProgressUpdate | null;
  timeoutId: NodeJS.Timeout | null;
}

/**
 * Creates a throttled progress updater to prevent UI thrashing from frequent updates.
 * Updates are throttled to at most once every MIN_PROGRESS_UPDATE_INTERVAL_MS per comparison.
 * Each comparison has isolated state to prevent race conditions when multiple comparisons run simultaneously.
 */
const createThrottledProgressUpdater = () => {
  const stateByComparison = new Map<ComparisonId, ThrottledProgressState>();

  const getOrCreateState = (comparisonId: ComparisonId): ThrottledProgressState => {
    let state = stateByComparison.get(comparisonId);
    if (!state) {
      state = {
        lastUpdateTime: 0,
        pendingUpdate: null,
        timeoutId: null,
      };
      stateByComparison.set(comparisonId, state);
    }
    return state;
  };

  const flushPendingUpdate = (comparisonId: ComparisonId) => {
    const state = stateByComparison.get(comparisonId);
    if (!state || !state.pendingUpdate) {
      return;
    }

    updateComparisonExecutionProgress(comparisonId, (previous): ComparisonExecutionProgress => {
      const now = Date.now();
      const baseSupportsFinishEarly = previous?.supportsFinishEarly ?? false;

      const base: ComparisonExecutionProgress =
        previous ??
        ({
          stage: COMPARISON_EXECUTION_STAGE.QUEUED,
          startedAt: now,
          updatedAt: now,
          completedBuckets: 0,
          pendingBuckets: 0,
          totalBuckets: 1,
          processedRows: 0,
          diffRows: 0,
          currentBucket: null,
          cancelRequested: false,
          supportsFinishEarly: baseSupportsFinishEarly,
        } satisfies ComparisonExecutionProgress);

      return {
        ...base,
        stage: state.pendingUpdate!.stage as ComparisonExecutionStage,
        updatedAt: now,
        completedBuckets: state.pendingUpdate!.completedBuckets ?? base.completedBuckets,
        pendingBuckets: state.pendingUpdate!.pendingBuckets ?? base.pendingBuckets,
        totalBuckets: state.pendingUpdate!.totalBuckets ?? base.totalBuckets,
        processedRows: state.pendingUpdate!.processedRows ?? base.processedRows,
        diffRows: state.pendingUpdate!.diffRows ?? base.diffRows,
        currentBucket: state.pendingUpdate!.currentBucket ?? base.currentBucket,
        supportsFinishEarly: baseSupportsFinishEarly || base.supportsFinishEarly,
      };
    });

    state.lastUpdateTime = Date.now();
    state.pendingUpdate = null;
    state.timeoutId = null;
  };

  const cleanupState = (comparisonId: ComparisonId) => {
    const state = stateByComparison.get(comparisonId);
    if (state?.timeoutId) {
      clearTimeout(state.timeoutId);
    }
    stateByComparison.delete(comparisonId);
  };

  return {
    update: (comparisonId: ComparisonId, update: AlgorithmProgressUpdate) => {
      const now = Date.now();
      const state = getOrCreateState(comparisonId);
      const timeSinceLastUpdate = now - state.lastUpdateTime;

      state.pendingUpdate = update;

      if (timeSinceLastUpdate >= MIN_PROGRESS_UPDATE_INTERVAL_MS) {
        if (state.timeoutId) {
          clearTimeout(state.timeoutId);
          state.timeoutId = null;
        }
        flushPendingUpdate(comparisonId);
      } else if (!state.timeoutId) {
        const delay = MIN_PROGRESS_UPDATE_INTERVAL_MS - timeSinceLastUpdate;
        state.timeoutId = setTimeout(() => flushPendingUpdate(comparisonId), delay);
      }
    },
    cleanup: cleanupState,
  };
};

/**
 * Updates comparison progress from algorithm progress updates
 */
const progressUpdater = createThrottledProgressUpdater();

interface ComparisonExecutionState {
  pool: ConnectionPool;
  comparisonId: ComparisonId;
  algorithm: ComparisonAlgorithm | null;
  tableName: string | null;
  startTime: number;
  finishEarlyComparisonRef: React.MutableRefObject<ComparisonId | null>;
  cancelRequestedRef: React.MutableRefObject<ComparisonId | null>;
}

/**
 * Handles errors during comparison execution with user-friendly messages
 */
const handleExecutionError = (err: unknown): string => {
  let message = err instanceof Error ? err.message : 'Unknown error';

  if (message.includes('does not exist') || message.includes('not found')) {
    message = `Table or view not found: ${message}. The data source may have been deleted or the database may have been closed.`;
  } else if (message.includes('Syntax') || message.includes('Parser Error')) {
    message = `SQL syntax error: ${message}. Please check your filter expressions.`;
  } else if (message.includes('Binder Error')) {
    message = `Column reference error: ${message}. This usually means a column was renamed or removed from the source.`;
  }

  return message;
};

/**
 * Cleans up partial results table if one was created
 */
const cleanupPartialResults = async (
  pool: ConnectionPool,
  comparisonId: ComparisonId,
  tableName: string,
): Promise<void> => {
  const dropOutcome = await dropComparisonResultsTable(pool, tableName);
  if (!dropOutcome.ok) {
    console.warn('Failed to drop partial comparison table', dropOutcome.error);
  }
  setComparisonPartialResults(comparisonId, false);
};

/**
 * Handles finish early requests - saves partial results and marks comparison as partial
 */
const handleFinishEarly = async (
  state: ComparisonExecutionState,
): Promise<{ tableName: string | null; durationSeconds: number }> => {
  const { comparisonId, tableName, startTime, finishEarlyComparisonRef } = state;

  finishEarlyComparisonRef.current = null;

  if (tableName) {
    setComparisonPartialResults(comparisonId, true);
  }

  updateComparisonExecutionProgress(
    comparisonId,
    (prev) =>
      prev
        ? {
            ...prev,
            stage: COMPARISON_EXECUTION_STAGE.PARTIAL,
            updatedAt: Date.now(),
            cancelRequested: false,
            supportsFinishEarly: false,
          }
        : createDefaultProgress(COMPARISON_EXECUTION_STAGE.PARTIAL),
    'AppStore/comparisonExecutionPartial',
  );

  clearComparisonExecutionProgress(comparisonId);
  setComparisonExecutionMetadata(comparisonId, null);

  const endTime = performance.now();
  const durationSeconds = (endTime - startTime) / 1000;

  return { tableName, durationSeconds };
};

/**
 * Handles user-initiated cancellation - discards results and cleans up
 */
const handleCancellation = async (state: ComparisonExecutionState): Promise<void> => {
  const { comparisonId, algorithm, tableName, pool, cancelRequestedRef } = state;

  if (algorithm?.supportsProgress) {
    updateComparisonExecutionProgress(
      comparisonId,
      (prev) =>
        prev
          ? {
              ...prev,
              stage: COMPARISON_EXECUTION_STAGE.CANCELLED,
              updatedAt: Date.now(),
              cancelRequested: false,
            }
          : null,
      'AppStore/comparisonExecutionCancelled',
    );
    clearComparisonExecutionProgress(comparisonId);
  }

  if (tableName) {
    await cleanupPartialResults(pool, comparisonId, tableName);
  }

  setComparisonExecutionMetadata(comparisonId, null);
  setComparisonPendingResultsTable(comparisonId, null);

  if (cancelRequestedRef.current === comparisonId) {
    cancelRequestedRef.current = null;
  }
};

/**
 * Handles actual execution failures - reports error and cleans up
 */
const handleFailure = async (
  err: unknown,
  state: ComparisonExecutionState,
  setError: (error: string) => void,
): Promise<void> => {
  const { comparisonId, algorithm, tableName, pool } = state;
  const message = handleExecutionError(err);

  setError(message);
  console.error('Comparison execution failed:', err);

  if (algorithm?.supportsProgress) {
    updateComparisonExecutionProgress(
      comparisonId,
      (prev) =>
        prev
          ? {
              ...prev,
              stage: COMPARISON_EXECUTION_STAGE.FAILED,
              updatedAt: Date.now(),
              cancelRequested: false,
              error: message,
            }
          : createDefaultProgress(COMPARISON_EXECUTION_STAGE.FAILED, message),
      'AppStore/comparisonExecutionFailed',
    );
    clearComparisonExecutionProgress(comparisonId);
  }

  if (tableName) {
    await cleanupPartialResults(pool, comparisonId, tableName);
  }

  setComparisonExecutionMetadata(comparisonId, null);
  setComparisonPendingResultsTable(comparisonId, null);
};

/**
 * Handles comparison execution errors including abort, finish early, and failures.
 * An AbortError can mean two things: a user-initiated cancel or a "finish early" request.
 * We check the finishEarlyComparisonRef to determine which action was intended.
 */
const handleComparisonError = async (
  err: unknown,
  state: ComparisonExecutionState,
  setError: (error: string) => void,
): Promise<{ tableName: string | null; durationSeconds: number } | null> => {
  const { comparisonId, algorithm, finishEarlyComparisonRef, cancelRequestedRef } = state;
  const isAbortError = err instanceof DOMException && err.name === 'AbortError';
  const finishEarlyRequested =
    algorithm?.supportsFinishEarly && finishEarlyComparisonRef.current === comparisonId;
  const cancelRequested = cancelRequestedRef.current === comparisonId;

  // Handle finish early: save partial results
  if (isAbortError && finishEarlyRequested) {
    return await handleFinishEarly(state);
  }

  // Handle cancellation: discard results
  if (isAbortError || cancelRequested) {
    await handleCancellation(state);
    return null;
  }

  // Handle actual failure: report error and clean up
  await handleFailure(err, state, setError);
  return null;
};

/**
 * Handles successful comparison execution cleanup and metadata storage
 */
const handleComparisonSuccess = async (
  state: ComparisonExecutionState,
  algorithm: ComparisonAlgorithm,
  result: {
    generatedSQL?: string;
    samplingParams?: { sampleSize: number; totalRows: number; samplingRate: number };
    metrics?: AlgorithmExecutionMetrics;
  },
  setGeneratedSQL: (sql: string | null) => void,
): Promise<{ tableName: string; durationSeconds: number }> => {
  const { pool, comparisonId, tableName, startTime } = state;

  if (result.generatedSQL) {
    setGeneratedSQL(result.generatedSQL);
  }

  const { comparisons } = useAppStore.getState();
  const existingComparison = comparisons.get(comparisonId);
  const previousTableName = existingComparison?.resultsTableName ?? null;

  if (previousTableName && previousTableName !== tableName) {
    const dropOutcome = await dropComparisonResultsTable(pool, previousTableName);
    if (!dropOutcome.ok) {
      throw dropOutcome.error;
    }
  }

  const endTime = performance.now();
  const durationSeconds = (endTime - startTime) / 1000;

  if (algorithm.supportsProgress) {
    updateComparisonExecutionProgress(
      comparisonId,
      (prev) =>
        prev
          ? {
              ...prev,
              stage: COMPARISON_EXECUTION_STAGE.COMPLETED,
              updatedAt: Date.now(),
              cancelRequested: false,
            }
          : null,
      'AppStore/comparisonExecutionCompleted',
    );
    clearComparisonExecutionProgress(comparisonId);
  }

  setComparisonExecutionMetadata(comparisonId, {
    algorithmUsed: algorithm.name,
    samplingParams: result.samplingParams,
    hashDiffMetrics:
      result.metrics && result.metrics.type === 'hash-diff' ? result.metrics.stats : undefined,
  });

  setComparisonPartialResults(comparisonId, false);

  return { tableName: tableName!, durationSeconds };
};

/**
 * Hook to execute comparison queries
 */
export const useComparisonExecution = (pool: ConnectionPool) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedSQL, setGeneratedSQL] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const runningComparisonIdRef = useRef<ComparisonId | null>(null);

  // Track the "finish early" request using a ref. This is necessary because both
  // cancellation and finishing early use the same AbortController mechanism.
  // Inside the catch block for an AbortError, we check this ref to determine
  // which action was requested by the user and handle them differently:
  // - cancel: discard results and clear the comparison
  // - finish early: keep partial results and mark the comparison as partial
  const finishEarlyComparisonRef = useRef<ComparisonId | null>(null);
  const cancelRequestedRef = useRef<ComparisonId | null>(null);

  const executeComparison = useCallback(
    async (
      comparisonId: ComparisonId,
      config: ComparisonConfig,
      schemaComparison: SchemaComparisonResult,
    ) => {
      setIsExecuting(true);
      setError(null);
      const startTime = performance.now();
      let controller: AbortController | null = null;
      let tableName: string | null = null;
      let algorithm: ComparisonAlgorithm | null = null;
      finishEarlyComparisonRef.current = null;
      cancelRequestedRef.current = null;

      // Reset metadata flags so stale execution details don't leak into the next run
      setComparisonExecutionMetadata(comparisonId, null);
      setComparisonPartialResults(comparisonId, false);

      try {
        const validationError = validateComparisonConfig(config, schemaComparison);
        if (validationError) {
          setError(validationError);
          return null;
        }

        // Select the best algorithm for this comparison
        const algorithmMode = config.algorithm ?? 'auto';
        algorithm = selectAlgorithm(algorithmMode, {
          pool,
          comparisonId,
          config,
          schemaComparison,
        });

        const createdAt = new Date();
        tableName = getComparisonResultsTableName(comparisonId, config, createdAt);
        setComparisonPendingResultsTable(comparisonId, tableName);

        // Clear progress if algorithm doesn't support it
        if (!algorithm.supportsProgress) {
          clearComparisonExecutionProgress(comparisonId);
        }

        // Setup cancellation if supported
        if (algorithm.supportsCancellation) {
          controller = new AbortController();
          abortControllerRef.current = controller;
          runningComparisonIdRef.current = comparisonId;

          // Initialize progress tracking
          const startedAt = Date.now();
          updateComparisonExecutionProgress(
            comparisonId,
            () => ({
              stage: COMPARISON_EXECUTION_STAGE.QUEUED,
              startedAt,
              updatedAt: startedAt,
              completedBuckets: 0,
              pendingBuckets: 1,
              totalBuckets: 1,
              processedRows: 0,
              diffRows: 0,
              currentBucket: null,
              cancelRequested: false,
              supportsFinishEarly: algorithm?.supportsFinishEarly ?? false,
            }),
            'AppStore/comparisonExecutionQueued',
          );
        }

        // Create algorithm context
        const context: AlgorithmContext = {
          pool,
          comparisonId,
          config,
          schemaComparison,
          tableName,
          abortSignal: controller?.signal ?? new AbortController().signal,
        };

        // Execute the algorithm
        const result = await algorithm.execute(
          context,
          algorithm.supportsProgress
            ? (update) => progressUpdater.update(comparisonId, update)
            : undefined,
        );

        // Handle successful execution
        return await handleComparisonSuccess(
          {
            pool,
            comparisonId,
            algorithm,
            tableName,
            startTime,
            finishEarlyComparisonRef,
            cancelRequestedRef,
          },
          algorithm,
          result,
          setGeneratedSQL,
        );
      } catch (err) {
        // Handle execution errors
        return await handleComparisonError(
          err,
          {
            pool,
            comparisonId,
            algorithm,
            tableName,
            startTime,
            finishEarlyComparisonRef,
            cancelRequestedRef,
          },
          setError,
        );
      } finally {
        abortControllerRef.current = null;
        runningComparisonIdRef.current = null;
        finishEarlyComparisonRef.current = null;
        cancelRequestedRef.current = null;
        progressUpdater.cleanup(comparisonId);
        setIsExecuting(false);
      }
    },
    [pool],
  );

  const cancelComparison = useCallback((comparisonId: ComparisonId) => {
    cancelRequestedRef.current = comparisonId;
    if (runningComparisonIdRef.current !== comparisonId) {
      return;
    }
    markComparisonCancelRequested(comparisonId);
    abortControllerRef.current?.abort();
  }, []);

  const finishEarlyComparison = useCallback((comparisonId: ComparisonId) => {
    if (runningComparisonIdRef.current !== comparisonId) {
      return;
    }
    finishEarlyComparisonRef.current = comparisonId;
    abortControllerRef.current?.abort();
  }, []);

  return {
    executeComparison,
    cancelComparison,
    finishEarlyComparison,
    isExecuting,
    error,
    generatedSQL,
  };
};
