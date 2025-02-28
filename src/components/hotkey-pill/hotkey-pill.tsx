import { Pill, Text } from '@mantine/core';
import { PropsWithChildren, ReactNode } from 'react';

interface HotkeyPillProps extends PropsWithChildren {
  value?: Array<string | ReactNode>;
  variant?: 'secondary' | 'tertiary';
}

export const HotkeyPill = ({ value, children, variant }: HotkeyPillProps) => {
  if (!value && !children) return null;

  return (
    <Pill
      bg={variant === 'secondary' ? 'background-secondary' : 'background-tertiary'}
      c="icon-default"
      className="px-4 py-1 h-7 text-base font-mono"
      classNames={{ label: 'flex items-center justify-center', root: 'justify-center' }}
    >
      {children || (
        <div className="flex items-center justify-center gap-1 mx-auto font-mono">
          {value?.map((item, index) => (
            <Text key={index} className="text-sm">
              {item}
            </Text>
          ))}
        </div>
      )}
    </Pill>
  );
};
