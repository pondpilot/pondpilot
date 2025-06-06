import { RemoteDB } from '@models/data-source';
import React from 'react';

import { ConnectionStateIcon } from './connection-state-icon';

interface DatabaseLabelProps {
  label: string;
  isRemote?: boolean;
  connectionState?: RemoteDB['connectionState'];
  connectionError?: string;
  title?: string;
}

export const DatabaseLabel = ({
  label,
  isRemote,
  connectionState,
  connectionError,
  title,
}: DatabaseLabelProps) => {
  if (!isRemote) {
    return <span title={title}>{label}</span>;
  }

  return (
    <span className="flex items-center gap-2" title={title}>
      {label}
      {connectionState && <ConnectionStateIcon state={connectionState} error={connectionError} />}
    </span>
  );
};
