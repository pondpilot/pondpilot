import { Text } from '@mantine/core';
import React from 'react';

interface StatsRowProps {
  label: string;
  value: string | number;
  isLast?: boolean;
}

export function StatsRow({ label, value, isLast = false }: StatsRowProps) {
  return (
    <div
      className={`flex justify-between items-center px-3 py-2 ${
        !isLast ? 'border-b border-borderLight-light dark:border-borderLight-dark' : ''
      }`}
    >
      <Text c="text-primary" className="text-xs">
        {label}
      </Text>
      <Text fw={500} c="text-primary" className="text-xs">
        {value}
      </Text>
    </div>
  );
}
