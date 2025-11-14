import { notifications } from '@mantine/notifications';
import { ComparisonSource } from '@models/comparison';
import { useCallback, useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';

import { DATASET_DND_MIME_TYPE } from '../../../constants/dnd';
import { parseComparisonSource } from '../utils/validation';

/**
 * Helper function to check if a drag event contains dataset data
 */
const isDatasetDragEvent = (event: ReactDragEvent<HTMLElement>) =>
  Array.from(event.dataTransfer?.types ?? []).includes(DATASET_DND_MIME_TYPE);

export interface UseDatasetDropTargetOptions {
  /**
   * Callback invoked when a valid dataset is dropped
   */
  onDrop: (source: ComparisonSource) => void;

  /**
   * Optional filter to accept only specific types of comparison sources
   * If provided, only sources passing this filter will trigger onDrop
   */
  acceptFilter?: (source: ComparisonSource) => boolean;

  /**
   * Custom error message to show when drop fails validation
   */
  errorMessage?: string;
}

export interface UseDatasetDropTargetReturn {
  /**
   * Whether a dataset is currently being dragged over this target
   */
  isDragOver: boolean;

  /**
   * Drag event handlers to spread onto the drop target element
   */
  dropHandlers: {
    onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
    onDragLeave: (event: ReactDragEvent<HTMLElement>) => void;
    onDrop: (event: ReactDragEvent<HTMLElement>) => void;
  };
}

/**
 * Custom hook for handling dataset drag-and-drop on a target element.
 * Provides drag-over state and validated drop handling with error notifications.
 *
 * @example
 * ```tsx
 * const { isDragOver, dropHandlers } = useDatasetDropTarget({
 *   onDrop: (source) => setSelectedSource(source),
 *   acceptFilter: (source) => source.type === 'table',
 * });
 *
 * return (
 *   <Button
 *     {...dropHandlers}
 *     style={isDragOver ? dragOverStyles : undefined}
 *   >
 *     Drop dataset here
 *   </Button>
 * );
 * ```
 */
export function useDatasetDropTarget({
  onDrop,
  acceptFilter,
  errorMessage = 'Invalid dataset format',
}: UseDatasetDropTargetOptions): UseDatasetDropTargetReturn {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (!isDatasetDragEvent(event)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (!isDatasetDragEvent(event)) {
      return;
    }
    const next = event.relatedTarget as Node | null;
    if (!next || !event.currentTarget.contains(next)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (!isDatasetDragEvent(event)) {
        return;
      }

      event.preventDefault();
      setIsDragOver(false);

      const payload = event.dataTransfer.getData(DATASET_DND_MIME_TYPE);
      if (!payload) {
        console.error('Drop event received but no payload data found');
        return;
      }

      const droppedSource = parseComparisonSource(payload);

      if (!droppedSource) {
        notifications.show({
          title: 'Drop failed',
          message: errorMessage,
          color: 'red',
        });
        console.error('Failed to parse dataset drop payload:', payload);
        return;
      }

      // Apply acceptance filter if provided
      if (acceptFilter && !acceptFilter(droppedSource)) {
        notifications.show({
          title: 'Invalid dataset',
          message: 'This dataset type is not accepted here',
          color: 'orange',
        });
        return;
      }

      onDrop(droppedSource);
    },
    [onDrop, acceptFilter, errorMessage],
  );

  return {
    isDragOver,
    dropHandlers: {
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  };
}
