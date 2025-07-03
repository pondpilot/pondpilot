import { IconFolderPlus } from '@tabler/icons-react';

import { BaseActionCard } from './base-action-card';

interface FolderCardProps {
  onClose: () => void;
  handleAddFolder: () => Promise<void>;
}

export function FolderCard({ onClose, handleAddFolder }: FolderCardProps) {
  const handleClick = async () => {
    await handleAddFolder();
    onClose();
  };

  return (
    <BaseActionCard
      onClick={handleClick}
      icon={
        <IconFolderPlus
          size={48}
          className="text-textSecondary-light dark:text-textSecondary-dark"
          stroke={1.5}
        />
      }
      title="Add Folder"
      description="Browse entire directories"
    />
  );
}
