import {
  ActionIcon,
  Group,
  Menu,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { NotebookCellType } from '@models/notebook';
import {
  IconCode,
  IconDownload,
  IconMarkdown,
  IconPlayerPlay,
  IconPlus,
} from '@tabler/icons-react';
import { cn } from '@utils/ui/styles';
import { memo, useCallback, useState, useRef, useEffect } from 'react';

interface NotebookToolbarProps {
  notebookName: string;
  onRename: (name: string) => void;
  onAddCell: (type: NotebookCellType) => void;
  onRunAll?: () => void;
  onExportSqlnb?: () => void;
  onExportHtml?: () => void;
}

export const NotebookToolbar = memo(
  (props: NotebookToolbarProps) => {
    const {
      notebookName, onRename, onAddCell, onRunAll, onExportSqlnb, onExportHtml,
    } = props;
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState(notebookName);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      setEditValue(notebookName);
    }, [notebookName]);

    useEffect(() => {
      if (editing && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [editing]);

    const handleNameSubmit = useCallback(() => {
      const trimmed = editValue.trim();
      if (trimmed && trimmed !== notebookName) {
        onRename(trimmed);
      } else {
        setEditValue(notebookName);
      }
      setEditing(false);
    }, [editValue, notebookName, onRename]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
          handleNameSubmit();
        } else if (e.key === 'Escape') {
          setEditValue(notebookName);
          setEditing(false);
        }
      },
      [handleNameSubmit, notebookName],
    );

    return (
      <Group
        className={cn(
          'px-3 h-10 justify-between',
          'border-b border-borderPrimary-light dark:border-borderPrimary-dark',
          'bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark',
        )}
      >
        <Group gap={8}>
          {/* Notebook name */}
          {editing ? (
            <TextInput
              ref={inputRef}
              value={editValue}
              onChange={(e) => setEditValue(e.currentTarget.value)}
              onBlur={handleNameSubmit}
              onKeyDown={handleKeyDown}
              size="xs"
              variant="unstyled"
              styles={{
                input: {
                  fontWeight: 600,
                  fontSize: '14px',
                },
              }}
            />
          ) : (
            <span
              className={cn(
                'text-sm font-semibold cursor-pointer select-none',
                'text-textPrimary-light dark:text-textPrimary-dark',
                'hover:underline',
              )}
              onDoubleClick={() => setEditing(true)}
            >
              {notebookName}
            </span>
          )}
        </Group>

        <Group gap={4}>
          {/* Run All button */}
          {onRunAll && (
            <Tooltip label="Run all SQL cells" position="top">
              <ActionIcon
                size="sm"
                variant="subtle"
                className="text-iconDefault-light dark:text-iconDefault-dark"
                onClick={onRunAll}
              >
                <IconPlayerPlay size={16} />
              </ActionIcon>
            </Tooltip>
          )}

          {/* Add Cell dropdown */}
          <Menu width={160} shadow="md" position="bottom-end">
            <Menu.Target>
              <Tooltip label="Add cell" position="top">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  className="text-iconDefault-light dark:text-iconDefault-dark"
                >
                  <IconPlus size={16} />
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconCode size={14} />}
                onClick={() => onAddCell('sql')}
              >
                SQL Cell
              </Menu.Item>
              <Menu.Item
                leftSection={<IconMarkdown size={14} />}
                onClick={() => onAddCell('markdown')}
              >
                Markdown Cell
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>

          {/* Export dropdown */}
          <Menu width={160} shadow="md" position="bottom-end">
            <Menu.Target>
              <Tooltip label="Export" position="top">
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  className="text-iconDefault-light dark:text-iconDefault-dark"
                >
                  <IconDownload size={16} />
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={onExportSqlnb}>Export as .sqlnb</Menu.Item>
              <Menu.Item onClick={onExportHtml}>Export as HTML</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    );
  },
);

NotebookToolbar.displayName = 'NotebookToolbar';
