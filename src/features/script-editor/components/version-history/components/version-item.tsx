import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import { ScriptVersion } from '@models/script-version';
import {
  IconClock,
  IconCopy,
  IconEdit,
  IconPlayerPlay,
  IconRestore,
  IconTag,
} from '@tabler/icons-react';
import { formatTime } from '@utils/date-formatters';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';

const ITEM_CLASSES = {
  base: 'cursor-pointer py-2 px-3 rounded-lg group bg-transparent transition-all duration-150',
  hover: 'hover:bg-transparent004-light dark:hover:bg-transparent004-dark',
  selected: 'bg-transparent008-light dark:bg-transparent008-dark',
  compareSelected:
    'bg-transparentBrandBlue-012 border border-borderAccent-light dark:border-borderAccent-dark',
};

const VersionTypeIcon = ({ type }: { type: ScriptVersion['type'] }) => {
  switch (type) {
    case 'run':
      return <IconPlayerPlay size={16} />;
    case 'named':
    case 'manual':
      return <IconTag size={16} />;
    default:
      return <IconClock size={16} />;
  }
};

const getVersionTypeLabel = (type: ScriptVersion['type']): string => {
  switch (type) {
    case 'run':
      return 'Query Run';
    case 'named':
      return 'Named Version';
    case 'manual':
      return 'Manual Save';
    default:
      return 'Auto-save';
  }
};

interface VersionItemProps {
  version: ScriptVersion;
  isSelected: boolean;
  isCompareTarget: boolean;
  compareMode: boolean;
  isCurrent: boolean;
  onSelect: (version: ScriptVersion) => void;
  onRename: (version: ScriptVersion) => void;
  onRestore: (version: ScriptVersion) => void;
  onCopy: (version: ScriptVersion) => void;
}

export const VersionItem = ({
  version,
  isSelected,
  isCompareTarget,
  compareMode,
  isCurrent,
  onSelect,
  onRename,
  onRestore,
  onCopy,
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
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap="xs" wrap="nowrap" className="flex-1 min-w-0">
          <div
            className={cn(
              'flex-shrink-0 text-iconDefault-light dark:text-iconDefault-dark',
              (isSelected || isCompareTarget) && 'text-textAccent-light dark:text-textAccent-dark',
            )}
          >
            <VersionTypeIcon type={version.type} />
          </div>

          <div className="min-w-0 flex-1">
            <Group gap="xs" wrap="nowrap">
              <Text
                size="sm"
                fw={500}
                className="truncate text-textPrimary-light dark:text-textPrimary-dark"
              >
                {version.name || formatTime(version.timestamp)}
              </Text>
              <Text
                size="xs"
                className="flex-shrink-0 text-textSecondary-light dark:text-textSecondary-dark"
              >
                {getVersionTypeLabel(version.type)}
              </Text>
              {isCurrent && (
                <Text
                  size="xs"
                  fw={600}
                  className="flex-shrink-0 uppercase text-textAccent-light dark:text-textAccent-dark"
                >
                  Current
                </Text>
              )}
            </Group>

            {version.description && (
              <Text
                size="xs"
                className="truncate text-textSecondary-light dark:text-textSecondary-dark"
                mt={2}
              >
                {version.description}
              </Text>
            )}

            {version.metadata && (
              <Text size="xs" className="text-textTertiary-light dark:text-textTertiary-dark">
                {version.metadata.linesCount} lines • {version.metadata.charactersCount} chars
              </Text>
            )}
          </div>
        </Group>

        <Group
          gap={4}
          wrap="nowrap"
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex-shrink-0"
        >
          <Tooltip label="Copy content">
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onCopy(version);
              }}
            >
              <IconCopy size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Name this version">
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onRename(version);
              }}
            >
              <IconEdit size={14} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Restore this version">
            <ActionIcon
              variant="subtle"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onRestore(version);
              }}
            >
              <IconRestore size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
    </div>
  );
};
