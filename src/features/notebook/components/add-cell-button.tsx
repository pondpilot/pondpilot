import { ActionIcon, Group, Tooltip, Transition } from '@mantine/core';
import { NotebookCellType } from '@models/notebook';
import { IconPlus, IconCode, IconMarkdown } from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';
import { memo, useState, useCallback } from 'react';

interface AddCellButtonProps {
  onAddCell: (type: NotebookCellType) => void;
}

export const AddCellButton = memo(({ onAddCell }: AddCellButtonProps) => {
  const [expanded, setExpanded] = useState(false);

  const handleAddSQL = useCallback(() => {
    onAddCell('sql');
    setExpanded(false);
  }, [onAddCell]);

  const handleAddMarkdown = useCallback(() => {
    onAddCell('markdown');
    setExpanded(false);
  }, [onAddCell]);

  return (
    <div
      className="flex justify-center py-1"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <Transition mounted={expanded} transition="fade" duration={150}>
        {(styles) => (
          <Group gap={4} style={styles}>
            <Tooltip label="Add SQL cell" position="top">
              <ActionIcon
                data-testid="notebook-add-sql-cell-inline-button"
                size="sm"
                variant="subtle"
                onClick={handleAddSQL}
                className={cn('text-iconDefault-light dark:text-iconDefault-dark')}
              >
                <IconCode size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Add Markdown cell" position="top">
              <ActionIcon
                data-testid="notebook-add-markdown-cell-inline-button"
                size="sm"
                variant="subtle"
                onClick={handleAddMarkdown}
                className={cn('text-iconDefault-light dark:text-iconDefault-dark')}
              >
                <IconMarkdown size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        )}
      </Transition>

      <Transition mounted={!expanded} transition="fade" duration={150}>
        {(styles) => (
          <div style={styles}>
            <Tooltip label="Add cell" position="top">
              <ActionIcon
                data-testid="notebook-add-cell-inline-button"
                size="sm"
                variant="subtle"
                className={cn(
                  'text-iconDefault-light dark:text-iconDefault-dark',
                  'opacity-30 hover:opacity-100 transition-opacity',
                )}
                onClick={() => setExpanded(true)}
              >
                <IconPlus size={14} />
              </ActionIcon>
            </Tooltip>
          </div>
        )}
      </Transition>
    </div>
  );
});

AddCellButton.displayName = 'AddCellButton';
