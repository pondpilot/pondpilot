import { Paper, Text, Box } from '@mantine/core';
import { IconTable, IconDatabase, IconFileText, IconAlertCircle } from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';
import { useEffect, useRef, useState } from 'react';

import { MentionSuggestion } from '../hooks/useMentions';

interface MentionDropdownProps {
  suggestions: MentionSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: MentionSuggestion) => void;
  anchorRect?: DOMRect;
  maxHeight?: number;
  'data-testid'?: string;
}

const getMentionIcon = (type?: string) => {
  switch (type) {
    case 'database':
      return <IconDatabase size={16} />;
    case 'table':
      return <IconTable size={16} />;
    case 'view':
      return <IconDatabase size={16} />;
    case 'dataset':
    case 'query':
      return <IconFileText size={16} />;
    case 'error':
      return <IconAlertCircle size={16} />;
    default:
      return <IconTable size={16} />;
  }
};

export const MentionDropdown = ({
  suggestions,
  selectedIndex,
  onSelect,
  anchorRect,
  maxHeight = 200,
  'data-testid': dataTestId = 'mention-dropdown',
}: MentionDropdownProps) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top?: number; bottom?: number; left: number }>({
    left: 0,
  });

  // Calculate dropdown position based on anchor element and available space
  useEffect(() => {
    if (!anchorRect || !dropdownRef.current) return;

    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - anchorRect.bottom;
    const spaceAbove = anchorRect.top;

    // Get actual dropdown height
    const dropdownHeight = Math.min(
      dropdownRef.current.scrollHeight || suggestions.length * 40 + 20,
      maxHeight,
    );

    // Determine position
    const shouldShowAbove = spaceBelow < dropdownHeight + 20 && spaceAbove > spaceBelow;

    if (shouldShowAbove) {
      // Position above
      setPosition({
        bottom: viewportHeight - anchorRect.top + 4,
        left: anchorRect.left,
      });
    } else {
      // Position below
      setPosition({
        top: anchorRect.bottom + 4,
        left: anchorRect.left,
      });
    }
  }, [anchorRect, suggestions.length, maxHeight]);

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <Paper
      ref={dropdownRef}
      shadow="md"
      radius="md"
      className={cn(
        'fixed z-[10000]',
        'min-w-[200px] max-w-[400px]',
        'bg-white dark:bg-[#1f2937]',
        'border border-[#e5e7eb] dark:border-[#374151]',
        'shadow-lg',
        'rounded-xl',
        'overflow-hidden',
      )}
      style={{
        top: position.top,
        bottom: position.bottom,
        left: position.left,
      }}
      data-testid={dataTestId}
      role="listbox"
      aria-label="Mention suggestions"
    >
      <Box
        className="py-1 [&::-webkit-scrollbar]:hidden"
        style={
          {
            maxHeight,
            overflowY: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          } as React.CSSProperties
        }
      >
        {suggestions.map((suggestion, index) => (
          <Box
            key={`${suggestion.type}-${suggestion.value}-${index}`}
            className={cn(
              'flex items-center gap-2 px-3 py-2 mx-2 rounded-lg cursor-pointer transition-colors',
              'hover:bg-[#2123280A] dark:hover:bg-[#FFFFFF0A]',
              selectedIndex === index && 'bg-[#E0E2F4] dark:bg-[#29324C]',
              suggestion.type === 'error' && 'cursor-default opacity-70',
            )}
            onClick={() => {
              if (suggestion.type !== 'error') {
                onSelect(suggestion);
              }
            }}
            onMouseEnter={() => {
              if (suggestion.type !== 'error') {
                // Update selected index on hover
                if ('_onSelectionChange' in dropdownRef.current!) {
                  (dropdownRef.current as any)._onSelectionChange?.(index);
                }
              }
            }}
            role="option"
            aria-selected={selectedIndex === index}
            id={`mention-option-${index}`}
            data-testid={`mention-option-${index}`}
          >
            <span className="text-[#6F7785] dark:text-[#A8B3C4] flex-shrink-0">
              {getMentionIcon(suggestion.type)}
            </span>
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <Text
                size="sm"
                className={cn(
                  'font-medium truncate',
                  suggestion.type === 'error'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-[#6F7785] dark:text-[#A8B3C4]',
                )}
              >
                {suggestion.label}
              </Text>
              {suggestion.contextInfo && (
                <Text size="xs" className="text-[#9ca3af] dark:text-[#6b7280] truncate">
                  {suggestion.contextInfo}
                </Text>
              )}
            </div>
          </Box>
        ))}
      </Box>
    </Paper>
  );
};
