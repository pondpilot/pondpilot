import { Button, Group, Menu } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import {
  IconChevronDown,
  IconChevronRight,
  IconCommand,
  IconArrowBigUp,
  IconArrowBack,
} from '@tabler/icons-react';

interface RunQueryButtonProps {
  disabled?: boolean;
  handleRunQuery: (mode: 'all' | 'selection') => void;
}

export const RunQueryButton = ({ disabled, handleRunQuery }: RunQueryButtonProps) => {
  const [defaultOption, setDefaultOption] = useLocalStorage<'all' | 'selection'>({
    key: 'default-run-option',
    defaultValue: 'all',
  });

  const buttonText = {
    all: 'Run All',
    selection: 'Run Selection',
  }[defaultOption];

  return (
    <Button.Group>
      <Button
        onClick={() => handleRunQuery(defaultOption)}
        className="px-3 min-w-20 font-normal"
        color="background-accent"
        data-testid="run-query-button"
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
            onClick={() => handleRunQuery('all')}
          >
            Run all
          </Menu.Item>
          <Menu.Item
            rightSection={
              <Group gap={0} c="icon-disabled">
                <IconArrowBigUp size={18} />
                <IconCommand size={20} />
                <IconArrowBack size={20} />
              </Group>
            }
            onClick={() => handleRunQuery('selection')}
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
                Run all
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
