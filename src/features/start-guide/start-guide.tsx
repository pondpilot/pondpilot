import duckDark from '@assets/duck-dark.svg';
import duck from '@assets/duck.svg';
import { HotkeyPill } from '@components/hotkey-pill';
import { ICON_CLASSES, SCRIPT_DISPLAY_NAME } from '@components/spotlight/consts';
import { createSQLScript } from '@controllers/sql-script';
import { getOrCreateTabFromScript } from '@controllers/tab';
import {
  ONBOARDING_MODAL_OPTIONS,
  OnboardingModalContent,
} from '@features/onboarding-modal-content';
import { useAddLocalFilesOrFolders } from '@hooks/use-add-local-files-folders';
import { useOsModifierIcon } from '@hooks/use-os-modifier-icon';
import { Button, Group, Image, Stack, Text, Title, useMantineColorScheme } from '@mantine/core';
import { modals } from '@mantine/modals';
import { spotlight } from '@mantine/spotlight';
import {
  IconChevronRight,
  IconDatabasePlus,
  IconFileImport,
  IconFilePlus,
  IconFolderPlus,
  IconPlus,
} from '@tabler/icons-react';
import { importSQLFiles } from '@utils/import-script-file';
import { setDataTestId } from '@utils/test-id';

export const StartGuide = () => {
  const mod = useOsModifierIcon();
  const { colorScheme } = useMantineColorScheme();
  const { handleAddFile, handleAddFolder } = useAddLocalFilesOrFolders();

  const shortcustList = [
    {
      key: 'create-new-script',
      label: `New ${SCRIPT_DISPLAY_NAME}`,
      icon: <IconPlus size={20} className={ICON_CLASSES} />,
      hotkey: ['Ctrl', 'N'],
      handler: () => {
        const newEmptyScript = createSQLScript();
        getOrCreateTabFromScript(newEmptyScript, true);
      },
    },
    {
      key: 'import-script',
      label: 'Import Queries',
      icon: <IconFileImport size={20} className={ICON_CLASSES} />,
      hotkey: [mod.control, 'I'],
      handler: () => {
        importSQLFiles();
      },
    },
    {
      key: 'add-file',
      label: 'Add File',
      icon: <IconFilePlus size={20} className={ICON_CLASSES} />,
      hotkey: [mod.control, 'F'],
      handler: () => {
        handleAddFile();
      },
    },
    {
      key: 'add-folder',
      label: 'Add Folder',
      icon: <IconFolderPlus size={20} className={ICON_CLASSES} />,
      hotkey: [mod.option, mod.command, 'F'],
      handler: () => {
        handleAddFolder();
      },
    },
    {
      key: 'add-duckdb-db',
      label: 'Add DuckDB Database',
      icon: <IconDatabasePlus size={20} className={ICON_CLASSES} />,
      hotkey: [mod.control, 'D'],
      handler: () => {
        handleAddFile(['.duckdb']);
      },
    },
  ];

  const goToList = [
    {
      key: 'go-to-menu',
      label: 'Go-To-Anything menu',
      onClick: spotlight.open,
    },
    {
      key: 'onboarding',
      label: 'Quack Up Onboading',
      onClick: () => {
        const modalId = modals.open({
          ...ONBOARDING_MODAL_OPTIONS,
          children: <OnboardingModalContent onClose={() => modals.close(modalId)} />,
        });
      },
    },
  ];

  return (
    <Group
      justify="center"
      bg="background-secondary"
      className="h-full overflow-auto p-14"
      data-testid={setDataTestId('start-guide')}
    >
      <Stack w={700} gap={16}>
        <Stack className="px-2" gap={14}>
          <Group>
            <Image src={colorScheme === 'dark' ? duckDark : duck} />
            <Title order={1}>PondPilot</Title>
          </Group>
          <Title order={3}>Start data analysis with quick actions</Title>
        </Stack>
        <Group justify="space-between" align="start" mih={300}>
          <Stack flex={1} maw={340} miw={340}>
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
                    <Text c="text-primary">{item.label}</Text>
                  </Group>

                  <HotkeyPill variant="transparent" value={item.hotkey} />
                </Group>
              </Button>
            ))}
          </Stack>
          <Group w={340} justify="end">
            <Stack align="end">
              {goToList.map((item) => (
                <Button
                  key={item.key}
                  onClick={(e) => {
                    item.onClick();
                    // Remove focus after click
                    e.currentTarget.blur();
                  }}
                  data-testid={setDataTestId(`start-guide-action-${item.key}`)}
                  variant="subtle"
                  px={10}
                  h="auto"
                  w="fit-content"
                  c="text-secondary"
                  className="focus:outline-none focus:bg-transparentBrandBlue-016 dark:focus:bg-transparentBrandBlue-016 hover:bg-transparentBrandBlue-012 dark:hover:bg-transparent004-dark"
                >
                  <Group wrap="nowrap">
                    <Text c="text-secondary">{item.label}</Text>
                    <IconChevronRight className="text-textSecondary-light dark:text-textSecondary-dark" />
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
