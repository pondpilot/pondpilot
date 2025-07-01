import { IconFilePlus } from '@tabler/icons-react';

import { BaseActionCard } from './base-action-card';

interface FileCardProps {
  onClose: () => void;
  handleAddFile: () => Promise<void>;
}

export function FileCard({ onClose, handleAddFile }: FileCardProps) {
  const handleClick = async () => {
    await handleAddFile();
    onClose();
  };

  return (
    <BaseActionCard
      onClick={handleClick}
      icon={
        <IconFilePlus
          size={48}
          className="text-textSecondary-light dark:text-textSecondary-dark"
          stroke={1.5}
        />
      }
      title="Add Files"
      description="CSV, Parquet, JSON, Excel"
    />
  );
}
