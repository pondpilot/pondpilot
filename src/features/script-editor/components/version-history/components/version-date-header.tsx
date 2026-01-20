import { Text } from '@mantine/core';

import { formatDateHeader } from '../utils';

interface VersionDateHeaderProps {
  date: Date;
}

export const VersionDateHeader = ({ date }: VersionDateHeaderProps) => {
  return (
    <div className="sticky top-0 z-10 py-2 bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark">
      <Text
        size="xs"
        fw={600}
        className="uppercase tracking-wide text-textSecondary-light dark:text-textSecondary-dark"
      >
        {formatDateHeader(date)}
      </Text>
    </div>
  );
};
