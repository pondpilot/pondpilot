import type { ComparisonRowStatus } from '../utils/theme';

export const COMPARISON_STATUS_ORDER: readonly ComparisonRowStatus[] = [
  'added',
  'removed',
  'modified',
  'same',
] as const;

export const COMPARISON_DIFFERENCE_STATUSES: readonly ComparisonRowStatus[] =
  COMPARISON_STATUS_ORDER.slice(0, 3);

export const COMPARISON_STATUS_LABEL: Record<ComparisonRowStatus, string> = {
  added: 'Added',
  removed: 'Removed',
  modified: 'Modified',
  same: 'Unchanged',
};

export const COMPARISON_STATUS_DESCRIPTION: Record<ComparisonRowStatus, string> = {
  added: 'Row exists only in Source B',
  removed: 'Row exists only in Source A',
  modified: 'Row exists in both sources but differs in one or more columns',
  same: 'Row is identical across both sources',
};
