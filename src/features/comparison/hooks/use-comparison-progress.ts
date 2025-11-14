import { ComparisonExecutionProgress, ComparisonId } from '@models/comparison';
import { useComparisonExecutionProgress } from '@store/app-store';

export const useComparisonProgress = (
  comparisonId: ComparisonId | null,
): ComparisonExecutionProgress | null => {
  return useComparisonExecutionProgress(comparisonId);
};
