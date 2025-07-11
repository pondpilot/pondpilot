import { Button, Group, Menu } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { LOCAL_STORAGE_KEYS } from '@models/local-storage';
import { RunScriptMode } from '@models/sql-script';
import {
  IconChevronDown,
  IconChevronRight,
  IconCommand,
  IconArrowBigUp,
  IconArrowBack,
} from '@tabler/icons-react';
import { setDataTestId } from '@utils/test-id';

interface RunQueryButtonProps {
  disabled?: boolean;
  onRunClick: (mode: RunScriptMode) => void;
}

export const RunQueryButton = ({ disabled, onRunClick }: RunQueryButtonProps) => {
  const [defaultOption, setDefaultOption] = useLocalStorage<RunScriptMode>({
    key: LOCAL_STORAGE_KEYS.RUN_QUERY_BUTTON_VALUE,
    defaultValue: 'all',
  });

  const buttonText = {
    all: 'Run',
    selection: 'Run Selection',
  }[defaultOption];

  return (
    <Button.Group>
      <Button
        onClick={() => onRunClick(defaultOption)}
        className="px-3 min-w-20 font-normal"
        color="background-accent"
        data-testid={setDataTestId('run-query-button')}
      >
        {buttonText}
      </Button>
      <Menu
        width={176}
        shadow="md"
        position="bottom-start"
        closeOnItemClick={false}
        arrowPosition="center"
        disabled={disabled}
      >
        <Menu.Target>
          <div className="bg-backgroundAccent-light dark:bg-backgroundAccent-dark rounded-r-2xl border-l border-borderLight-light dark:border-borderLight-dark flex items-center justify-center cursor-pointer pr-2 pl-1">
            <IconChevronDown
              size={20}
              className="text-textContrast-light dark:text-textContrast-dark"
            />
          </div>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            rightSection={
              <Group gap={0} c="icon-disabled">
                <IconCommand size={20} />
                <IconArrowBack size={20} />
              </Group>
            }
            onClick={() => onRunClick('all')}
          >
            Run
          </Menu.Item>
          <Menu.Item
            rightSection={
              <Group gap={0} c="icon-disabled">
                <IconArrowBigUp size={18} />
                <IconCommand size={20} />
                <IconArrowBack size={20} />
              </Group>
            }
            onClick={() => onRunClick('selection')}
          >
            Run selection
          </Menu.Item>
          <Menu.Divider />
          <Menu width={156} shadow="md" position="right-start" closeOnItemClick={false}>
            <Menu.Target>
              <Menu.Item rightSection={<IconChevronRight size={18} />}>Default</Menu.Item>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                rightSection={defaultOption === 'all' ? '✓' : null}
                onClick={() => setDefaultOption('all')}
              >
                Run
              </Menu.Item>
              <Menu.Item
                rightSection={defaultOption === 'selection' ? '✓' : null}
                onClick={() => setDefaultOption('selection')}
              >
                Run selection
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Menu.Dropdown>
      </Menu>
    </Button.Group>
  );
};
