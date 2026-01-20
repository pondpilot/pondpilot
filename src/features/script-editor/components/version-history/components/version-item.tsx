import { Text } from '@mantine/core';
import { ScriptVersion } from '@models/script-version';
import { IconClock, IconPlayerPlay, IconTag } from '@tabler/icons-react';
import { formatRelativeTime } from '@utils/date-formatters';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';
import { type ReactElement } from 'react';

const ITEM_CLASSES = {
  base: 'cursor-pointer py-2.5 px-3 rounded-lg transition-all duration-150',
  hover: 'hover:bg-transparent004-light dark:hover:bg-transparent004-dark',
  selected: 'bg-transparent008-light dark:bg-transparent008-dark',
  compareSelected:
    'bg-transparentBrandBlue_palette-012-light dark:bg-transparentBrandBlue_palette-012-dark border border-borderAccent-light dark:border-borderAccent-dark',
};

function VersionTypeIcon({ type }: { type: ScriptVersion['type'] }): ReactElement {
  switch (type) {
    case 'run':
      return <IconPlayerPlay size={16} />;
    case 'named':
    case 'manual':
      return <IconTag size={16} />;
    default:
      return <IconClock size={16} />;
  }
}

function getVersionTypeLabel(type: ScriptVersion['type']): string {
  switch (type) {
    case 'run':
      return 'Run';
    case 'named':
      return 'Named';
    case 'manual':
      return 'Saved';
    default:
      return 'Auto-save';
  }
}

interface VersionItemProps {
  version: ScriptVersion;
  isSelected: boolean;
  isCompareTarget: boolean;
  compareMode: boolean;
  isCurrent: boolean;
  onSelect: (version: ScriptVersion) => void;
}

export const VersionItem = ({
  version,
  isSelected,
  isCompareTarget,
  compareMode,
  isCurrent,
  onSelect,
}: VersionItemProps) => {
  const showCompareHighlight = compareMode && (isSelected || isCompareTarget);
  const showRegularHighlight = !compareMode && isSelected;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(version);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        ITEM_CLASSES.base,
        ITEM_CLASSES.hover,
        showRegularHighlight && ITEM_CLASSES.selected,
        showCompareHighlight && ITEM_CLASSES.compareSelected,
      )}
      onClick={() => onSelect(version)}
      onKeyDown={handleKeyDown}
      data-testid={setDataTestId('version-item')}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            'flex-shrink-0 mt-0.5 text-iconDefault-light dark:text-iconDefault-dark',
            (isSelected || isCompareTarget) && 'text-textAccent-light dark:text-textAccent-dark',
          )}
        >
          <VersionTypeIcon type={version.type} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Text size="sm" fw={500} className="text-textPrimary-light dark:text-textPrimary-dark">
              {version.name || formatRelativeTime(version.timestamp)}
            </Text>
            <Text size="xs" className="text-textSecondary-light dark:text-textSecondary-dark">
              {getVersionTypeLabel(version.type)}
            </Text>
            {isCurrent && (
              <Text
                size="xs"
                fw={600}
                className="uppercase text-textAccent-light dark:text-textAccent-dark"
              >
                Current
              </Text>
            )}
          </div>

          {version.description && (
            <Text
              size="xs"
              className="text-textSecondary-light dark:text-textSecondary-dark mt-0.5"
            >
              {version.description}
            </Text>
          )}

          {version.metadata && (
            <Text size="xs" className="text-textTertiary-light dark:text-textTertiary-dark mt-0.5">
              {version.metadata.linesCount} lines
            </Text>
          )}
        </div>
      </div>
    </div>
  );
};
