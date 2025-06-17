import { memo } from 'react';

import { DataExplorerErrorBoundary } from './components';
import { DataExplorer } from './data-explorer';

export const DataExplorerWithErrorBoundary = memo(() => {
  return (
    <DataExplorerErrorBoundary>
      <DataExplorer />
    </DataExplorerErrorBoundary>
  );
});
