import { IconDatabasePlus } from '@tabler/icons-react';

import { BaseActionCard } from './base-action-card';

interface RemoteDatabaseCardProps {
  onClick: () => void;
}

export function RemoteDatabaseCard({ onClick }: RemoteDatabaseCardProps) {
  return (
    <BaseActionCard
      onClick={onClick}
      icon={
        <IconDatabasePlus
          size={48}
          className="text-textSecondary-light dark:text-textSecondary-dark"
          stroke={1.5}
        />
      }
      title="Remote Database"
      description="S3, GCS, Azure, HTTPS"
    />
  );
}
