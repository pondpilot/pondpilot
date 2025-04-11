import { Button, Group, Image, Stack, Text, useMantineColorScheme } from '@mantine/core';
import { useModifier } from '@hooks/useModifier';
import duck from '@assets/duck.svg';
import duckDark from '@assets/duck-dark.svg';
import {
  IconChevronRight,
  IconDatabasePlus,
  IconFileImport,
  IconFilePlus,
  IconFolderPlus,
  IconPlus,
} from '@tabler/icons-react';
import { HotkeyPill } from '@components/hotkey-pill';
import { useAppContext } from '@features/app-context';
import { useFileHandlers } from '@hooks/useUploadFilesHandlers';
import { spotlight } from '@mantine/spotlight';
import { setDataTestId } from '@utils/test-id';

export const StartGuide = () => {
  const mod = useModifier();
  const { colorScheme } = useMantineColorScheme();
  const iconClasses = 'text-iconDefault-light dark:text-iconDefault-dark';

  const { onCreateQueryFile, importSQLFiles } = useAppContext();
  const { handleAddSource } = useFileHandlers();

  const shortcustList = [
    {
      key: 'new-query',
      icon: <IconPlus size={20} className={iconClasses} />,
      label: 'New Query',
      hotkey: [mod.option, 'N'],
      handler: async () => {
        onCreateQueryFile({ entities: [{ name: 'query' }] });
      },
    },
    {
      key: 'import-query',
      label: 'Import Query',
      icon: <IconFileImport size={20} className={iconClasses} />,
      hotkey: [mod.control, 'I'],
      handler: async () => {
        importSQLFiles();
      },
    },
    {
      key: 'add-file',
      label: 'Add File',
      icon: <IconFilePlus size={20} className={iconClasses} />,
      hotkey: [mod.control, 'F'],
      handler: () => {
        handleAddSource('file')();
      },
    },
    {
      key: 'add-folder',
      label: 'Add Folder',
      icon: <IconFolderPlus size={20} className={iconClasses} />,
      hotkey: [mod.option, mod.command, 'F'],
      handler: () => {
        handleAddSource('folder')();
      },
    },
    {
      key: 'add-duckdb-db',
      label: 'Add DuckDB Database',
      icon: <IconDatabasePlus size={20} className={iconClasses} />,
      hotkey: [mod.control, 'D'],
      handler: () => {
        handleAddSource('file', ['.duckdb'])();
      },
    },
  ];

  const goToList = [
    {
      key: 'go-to-menu',
      label: 'Go-To-Anything menu',
      icon: <IconChevronRight size={24} className={iconClasses} />,
      handler: () => {
        spotlight.open();
      },
    },
  ];

  return (
    <Group
      justify="center"
      bg="background-secondary"
      p="md"
      className="h-full overflow-auto"
      data-testid={setDataTestId('start-guide')}
    >
      <Stack w={900}>
        <Group>
          <Image src={colorScheme === 'dark' ? duckDark : duck} />
          <Text c="text-primary" fw={400} className="text-4xl">
            PondPilot
          </Text>
        </Group>
        <Text fw={500} c="text-primary" className="text-2xl">
          Start data analysis with quick actions
        </Text>
        <Group align="start">
          <Stack style={{ flex: 1 }} className="max-w-[400px]">
            {shortcustList.map((item) => (
              <Button
                key={item.key}
                onClick={(e) => {
                  item.handler();
                  // Remove focus after click
                  e.currentTarget.blur();
                }}
                data-testid={setDataTestId(`start-guide-action-${item.key}`)}
                variant="subtle"
                styles={{
                  inner: {
                    display: 'block',
                  },
                }}
                px={10}
                h="auto"
                className="focus:outline-none focus:bg-transparentBrandBlue-016 dark:focus:bg-transparentBrandBlue-016 hover:bg-transparentBrandBlue-012 dark:hover:bg-transparent004-dark"
              >
                <Group w="100%" justify="space-between" wrap="nowrap">
                  <Group gap="sm" wrap="nowrap">
                    {item.icon}
                    <Text fw={400} c="text-primary" className="text-base">
                      {item.label}
                    </Text>
                  </Group>

                  <HotkeyPill variant="transparent" value={item.hotkey} />
                </Group>
              </Button>
            ))}
          </Stack>
          <Group style={{ flex: 1 }} justify="center">
            <Stack>
              {goToList.map((item) => (
                <Button
                  key={item.key}
                  onClick={(e) => {
                    item.handler();
                    // Remove focus after click
                    e.currentTarget.blur();
                  }}
                  data-testid={setDataTestId(`start-guide-action-${item.key}`)}
                  variant="subtle"
                  px={10}
                  h="auto"
                  w="fit-content"
                  className="focus:outline-none focus:bg-transparentBrandBlue-016 dark:focus:bg-transparentBrandBlue-016 hover:bg-transparentBrandBlue-012 dark:hover:bg-transparent004-dark"
                >
                  <Group wrap="nowrap">
                    <Text fw={400} c="text-secondary" className="text-base">
                      {item.label}
                    </Text>
                    {item.icon}
                  </Group>
                </Button>
              ))}
            </Stack>
          </Group>
        </Group>
      </Stack>
    </Group>
  );
};
