import { Pill, Text } from '@mantine/core';
import { cn } from '@utils/ui/styles';
import { PropsWithChildren, ReactNode } from 'react';

interface HotkeyPillProps extends PropsWithChildren {
  value?: Array<string | ReactNode>;
  variant?: 'secondary' | 'tertiary' | 'transparent';
  size?: 'xs' | 'sm' | 'md';
}

export const HotkeyPill = ({ value, children, variant, size = 'md' }: HotkeyPillProps) => {
  if (!value && !children) return null;

  return (
    <Pill
      bg={
        variant === 'transparent'
          ? 'transparent'
          : variant === 'secondary'
            ? 'background-secondary'
            : 'background-tertiary'
      }
      c="icon-default"
      className={cn(
        'font-mono',
        size === 'xs' ? 'py-0.5 h-5 text-xs' : size === 'sm' ? 'py-0.5 h-6 text-sm' : 'py-1 h-7 text-base',
        variant === 'transparent' ? 'px-0' : size === 'xs' ? 'px-2' : size === 'sm' ? 'px-3' : 'px-4'
      )}
      classNames={{ label: 'flex items-center justify-center', root: 'justify-center' }}
    >
      {children || (
        <div className="flex items-center justify-center gap-1 mx-auto font-mono">
          {value?.map((item, index) => (
            <Text c="text-secondary" key={index} className={size === 'xs' ? 'text-xs' : 'text-sm'}>
              {item}
            </Text>
          ))}
        </div>
      )}
    </Pill>
  );
};
