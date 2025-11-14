import duckDark from '@assets/duck-dark.svg';
import duck from '@assets/duck.svg';
import { ICON_CLASSES, SCRIPT_DISPLAY_NAME } from '@components/spotlight/consts';
import { createSQLScript } from '@controllers/sql-script';
import { getOrCreateTabFromScript } from '@controllers/tab';
import { createComparisonTab } from '@controllers/tab/comparison-tab-controller';
import { useOpenDataWizardModal } from '@features/datasource-wizard/utils';
import {
  ONBOARDING_MODAL_OPTIONS,
  OnboardingModalContent,
} from '@features/onboarding-modal-content';
import { WHATS_NEW_MODAL_OPTIONS, WhatsNewModal } from '@features/whats-new-modal';
import { useAddLocalFilesOrFolders } from '@hooks/use-add-local-files-folders';
import { useAppTheme } from '@hooks/use-app-theme';
import { useOsModifierIcon } from '@hooks/use-os-modifier-icon';
import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { spotlight } from '@mantine/spotlight';
import {
  IconChevronRight,
  IconDatabasePlus,
  IconFileImport,
  IconFilePlus,
  IconFolderPlus,
  IconPlus,
  IconScale,
} from '@tabler/icons-react';
import { importSQLFiles } from '@utils/import-script-file';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';

export const StartGuide = () => {
  const mod = useOsModifierIcon();
  const colorScheme = useAppTheme();
  const { handleAddFile, handleAddFolder } = useAddLocalFilesOrFolders();
  const { openDataWizardModal } = useOpenDataWizardModal();

  const shortcustList = [
    {
      key: 'create-new-script',
      label: `New ${SCRIPT_DISPLAY_NAME}`,
      icon: <IconPlus size={20} className={ICON_CLASSES} />,
      hotkey: [mod.control, mod.option, 'N'],

      handler: () => {
        const newEmptyScript = createSQLScript();
        getOrCreateTabFromScript(newEmptyScript, true);
      },
    },
    {
      key: 'create-new-comparison',
      label: 'New Comparison',
      icon: <IconScale size={20} className={ICON_CLASSES} />,
      hotkey: [mod.control, mod.option, 'C'],
      handler: () => {
        createComparisonTab({ setActive: true });
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
      key: 'add-remote-database',
      label: 'Add Remote Database',
      icon: <IconDatabasePlus size={20} className={ICON_CLASSES} />,
      hotkey: [mod.control, 'D'],
      handler: () => {
        openDataWizardModal('remote-config');
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
    {
      key: 'whats-new-modal',
      label: 'Release Notes',
      onClick: () => {
        const modalId = modals.open({
          ...WHATS_NEW_MODAL_OPTIONS,
          children: <WhatsNewModal onClose={() => modals.close(modalId)} />,
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
            <img
              src={colorScheme === 'dark' ? duckDark : duck}
              alt="PondPilot Duck"
              width={51}
              height={42}
              style={{ display: 'block' }}
            />
            <Title fw={400} order={1}>
              PondPilot
            </Title>
          </Group>
          <Title order={3}>Start data analysis with quick actions</Title>
        </Stack>
        <Stack justify="space-between" align="start" mih={300} className="xl:flex-row" gap={32}>
          <Stack flex={1} maw={340} miw={340} gap={8}>
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
                className={cn(
                  'group',
                  'focus:outline-none',
                  'focus:bg-transparentBrandBlue-012 dark:focus:bg-darkModeTransparentBrandBlue-032',
                  'hover:bg-transparent004-light dark:hover:bg-transparent004-dark',
                )}
              >
                <Group w="100%" justify="space-between" wrap="nowrap">
                  <Group gap="sm" wrap="nowrap">
                    {item.icon}
                    <Text c="text-primary">{item.label}</Text>
                  </Group>

                  <div
                    className={cn(
                      'bg-backgroundSecondary-light',
                      'dark:bg-backgroundSecondary-dark',
                      'dark:group-hover:bg-backgroundSecondary-dark',
                      'dark:group-focus:bg-backgroundSecondary-dark',
                      'flex items-center justify-center gap-1 font-mono px-4 py-1 rounded-full',
                    )}
                  >
                    {item.hotkey?.map((hk, index) => (
                      <Text c="text-secondary" key={index} className="text-sm">
                        {hk}
                      </Text>
                    ))}
                  </div>
                </Group>
              </Button>
            ))}
          </Stack>
          <Group w={340} className="xl:justify-end">
            <Stack align="start" gap={8}>
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
        </Stack>
      </Stack>
    </Group>
  );
};
