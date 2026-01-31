import { useState } from 'react';

import { DataExplorerFilterType, DEFAULT_FILE_TYPE_FILTER, FileTypeFilter } from '../components';

/**
 * Hook to manage data explorer state
 */
export const useDataExplorerState = () => {
  const [activeFilter, setActiveFilter] = useState<DataExplorerFilterType>('all');
  const [fileTypeFilter, setFileTypeFilter] = useState<FileTypeFilter>(DEFAULT_FILE_TYPE_FILTER);
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
