import { useState } from 'react';

import { DataExplorerFilterType, FileTypeFilter } from '../components';

/**
 * Hook to manage data explorer state
 */
export const useDataExplorerState = () => {
  const [activeFilter, setActiveFilter] = useState<DataExplorerFilterType>('all');
  const [fileTypeFilter, setFileTypeFilter] = useState<FileTypeFilter>({
    csv: true,
    json: true,
    parquet: true,
    xlsx: true,
  });
  const [searchQuery, setSearchQuery] = useState('');

  return {
    activeFilter,
    setActiveFilter,
    fileTypeFilter,
    setFileTypeFilter,
    searchQuery,
    setSearchQuery,
  };
};
