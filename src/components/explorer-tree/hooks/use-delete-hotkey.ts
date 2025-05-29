import { useHotkeys } from '@mantine/hooks';

/**
 * Custom hook for handling delete hotkey (mod+Backspace) in explorer trees
 *
 * @param selectedDeleteableNodeIds - Array of node IDs that can be deleted
 * @param onDelete - Callback function to handle deletion
 */
export function useDeleteHotkey<T>(
  selectedDeleteableNodeIds: T[],
  onDelete: (ids: T[]) => void | Promise<void>,
): void {
  useHotkeys([
    [
      'mod+Backspace',
      () => {
        if (selectedDeleteableNodeIds.length === 0) {
          return;
        }
        onDelete(selectedDeleteableNodeIds);
      },
    ],
  ]);
}
