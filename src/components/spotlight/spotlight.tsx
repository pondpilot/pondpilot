import { showError, showWarning } from '@components/app-notifications';
import { NamedIcon } from '@components/named-icon';
import { formatAndApplySQLScript } from '@controllers/sql-formatter';
import { createSQLScript } from '@controllers/sql-script';
import {
  getOrCreateTabFromLocalDBObject,
  getOrCreateTabFromFlatFileDataSource,
  getOrCreateTabFromScript,
  deleteTab,
} from '@controllers/tab';
import {
  getOrCreateTabFromComparison,
  createComparisonTab,
} from '@controllers/tab/comparison-tab-controller';
import { useOpenDataWizardModal } from '@features/datasource-wizard/utils';
import { ImportScriptModalContent } from '@features/script-import';
import { useAddLocalFilesOrFolders } from '@hooks/use-add-local-files-folders';
import { useOsModifierIcon } from '@hooks/use-os-modifier-icon';
import { Group, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { Spotlight } from '@mantine/spotlight';
import { APP_DOCS_URL, APP_OPEN_ISSUES_URL } from '@models/app-urls';
import { SYSTEM_DATABASE_NAME } from '@models/data-source';
import { useAppStore, useProtectedViews } from '@store/app-store';
import {
  IconDatabase,
  IconCode,
  IconPlus,
  IconFileImport,
  IconFilePlus,
  IconFolderPlus,
  IconDatabasePlus,
  IconSettings,
  IconFileSad,
  IconBooks,
  IconKeyboard,
  IconLayoutGridRemove,
  IconLayoutNavbarCollapse,
  IconScale,
} from '@tabler/icons-react';
import { isLocalDatabase, isRemoteDatabase } from '@utils/data-source';
import { fileSystemService } from '@utils/file-system-adapter';
import { importSQLFiles } from '@utils/import-script-file';
import { getFlatFileDataSourceName } from '@utils/navigation';
import { setDataTestId } from '@utils/test-id';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { SpotlightBreadcrumbs } from './components';
import { renderActionsGroup } from './components/action';
import {
  DATA_SOURCE_GROUP_DISPLAY_NAME,
  ICON_CLASSES,
  SCRIPT_DISPLAY_NAME,
  SCRIPT_GROUP_DISPLAY_NAME,
  COMPARISON_GROUP_DISPLAY_NAME,
  SEARCH_PREFIXES,
  SEARCH_SUFFIXES,
} from './consts';
import { Action, SpotlightView } from './model';
import { getSpotlightSearchPlaceholder, filterActions, getSearchTermFromValue } from './utlis';

/**
 * Filter list of script actions by search value and
 * ensures that the list is never empty, by adding a
 * fallback to create a new script action (with the serach term or default name)
 */
const getFilteredScriptActions = (
  scriptActions: Action[],
  searchValue: string,
  fallbackForEmpty: boolean,
) => {
  const filteredActions = filterActions(scriptActions, searchValue);

  // If we no results - add create new script action
  if (filteredActions.length === 0 && fallbackForEmpty) {
    const name = getSearchTermFromValue(searchValue);
    scriptActions.push({
      id: 'create-new',
      label: `Create ${name ? `"${name}"` : 'new'} ${SCRIPT_DISPLAY_NAME.toLowerCase()}`,
      icon: <IconPlus size={20} className={ICON_CLASSES} />,
      handler: () => {
        const newEmptyScript = createSQLScript(name);
        getOrCreateTabFromScript(newEmptyScript, true);
        Spotlight.close();
      },
    });
  }
  return scriptActions;
};

export const SpotlightMenu = () => {
  /**
   * Common hooks
   */

  const navigate = useNavigate();
  const location = useLocation();
  const openImportScriptModal = () => {
    const id = modals.open({
      size: 600,
      withCloseButton: false,
      children: <ImportScriptModalContent onClose={() => modals.close(id)} />,
    });
  };

  const { handleAddFile, handleAddFolder } = useAddLocalFilesOrFolders();
  const { command, option, control } = useOsModifierIcon();
  const { openDataWizardModal } = useOpenDataWizardModal();

  /**
   * Store access
   */
  const sqlScripts = useAppStore.use.sqlScripts();
  const comparisonsMap = useAppStore.use.comparisons();
  const dataSources = useAppStore.use.dataSources();
  const databaseMetadata = useAppStore.use.databaseMetadata();
  const localEntries = useAppStore.use.localEntries();
  const comparisonSourceSelectionCallback = useAppStore.use.comparisonSourceSelectionCallback();
  const protectedViews = useProtectedViews();

  /**
   * Local state
   */
  const [searchValue, setSearchValue] = useState('');
  const spotlightView = useAppStore.use.spotlightView();
  const setSpotlightView = useCallback((view: SpotlightView) => {
    useAppStore.setState({ spotlightView: view });
  }, []);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const resetSpotlight = () => {
    setSpotlightView('home');
    Spotlight.close();
    // Clear comparison source selection callback if it exists
    if (comparisonSourceSelectionCallback) {
      useAppStore.setState({ comparisonSourceSelectionCallback: null });
    }
  };

  const ensureHome = () => {
    if (location.pathname !== '/') {
      navigate('/');
    }
  };

  const navigateActions: Action[] = [
    {
      id: 'data-sources',
      label: 'Data Sources',
      handler: () => setSpotlightView('dataSources'),
      icon: <IconDatabase size={20} className={ICON_CLASSES} />,
    },
    {
      id: 'scripts',
      label: SCRIPT_GROUP_DISPLAY_NAME,
      handler: () => setSpotlightView('scripts'),
      icon: <IconCode size={20} className={ICON_CLASSES} />,
    },
    {
      id: 'settings',
      label: 'Settings',
      handler: () => {
        if (location.pathname !== '/settings') {
          navigate('/settings');
        }
        Spotlight.close();
      },
      icon: <IconSettings size={20} className={ICON_CLASSES} />,
    },
  ];

  const dataSourceActions: Action[] = [];

  for (const dataSource of dataSources.values()) {
    if (isLocalDatabase(dataSource) || isRemoteDatabase(dataSource)) {
      // For databases we need to read all tables and views from metadata
      const dbMetadata = databaseMetadata.get(dataSource.dbName);
      const isSystemDatabase =
        isLocalDatabase(dataSource) && dataSource.dbName === SYSTEM_DATABASE_NAME;

      if (!dbMetadata) {
        continue;
      }

      dbMetadata.schemas.forEach((schema) => {
        schema.objects.forEach((tableOrView) => {
          if (isSystemDatabase && protectedViews.has(tableOrView.name)) {
            return;
          }

          dataSourceActions.push({
            id: `open-data-source-${dataSource.id}-${tableOrView.name}`,
            label: tableOrView.label,
            icon: (
              <NamedIcon
                iconType={tableOrView.type === 'table' ? 'db-table' : 'db-view'}
                size={20}
                className={ICON_CLASSES}
              />
            ),
            handler: () => {
              // Check if we're in comparison source selection mode
              if (comparisonSourceSelectionCallback) {
                comparisonSourceSelectionCallback(dataSource, schema.name, tableOrView.name);
                Spotlight.close();
              } else {
                // Normal mode - open a tab
                getOrCreateTabFromLocalDBObject(
                  dataSource,
                  schema.name,
                  tableOrView.name,
                  tableOrView.type,
                  true,
                );
                Spotlight.close();
                ensureHome();
              }
            },
          });
        });
      });

      continue;
    }

    // Flat file data sources
    dataSourceActions.push({
      id: `open-data-source-${dataSource.id}`,
      label: getFlatFileDataSourceName(dataSource, localEntries),
      icon: <NamedIcon iconType={dataSource.type} size={20} className={ICON_CLASSES} />,
      handler: () => {
        // Check if we're in comparison source selection mode
        if (comparisonSourceSelectionCallback) {
          comparisonSourceSelectionCallback(dataSource);
          Spotlight.close();
        } else {
          // Normal mode - open a tab
          getOrCreateTabFromFlatFileDataSource(dataSource, true);
          Spotlight.close();
          ensureHome();
        }
      },
    });
  }

  const scriptActions = Array.from(sqlScripts.values()).map((script) => ({
    id: `open-data-source-${script.id}`,
    label: `${script.name}.sql`,
    icon: <NamedIcon iconType="code-file" size={20} className={ICON_CLASSES} />,
    handler: () => {
      getOrCreateTabFromScript(script.id, true);
      Spotlight.close();
      ensureHome();
    },
  }));

  const comparisonActions: Action[] = Array.from(comparisonsMap.values()).map((comparison) => ({
    id: `open-comparison-${comparison.id}`,
    label: comparison.name,
    icon: <NamedIcon iconType="comparison" size={20} className={ICON_CLASSES} />,
    handler: () => {
      getOrCreateTabFromComparison(comparison.id, true);
      Spotlight.close();
      ensureHome();
    },
  }));

  const browserInfo = fileSystemService.getBrowserInfo();
  const dataSourceGroupActions: Action[] = [
    {
      id: 'add-file',
      label: 'Add File',
      icon: <IconFilePlus size={20} className={ICON_CLASSES} />,
      hotkey: [control, 'F'],
      handler: () => {
        handleAddFile();
        resetSpotlight();
        ensureHome();
      },
    },
    // Only show Add Folder for browsers with full File System Access API support
    ...(browserInfo.level === 'full'
      ? [
          {
            id: 'add-folder',
            label: 'Add Folder',
            icon: <IconFolderPlus size={20} className={ICON_CLASSES} />,
            hotkey: [option, command, 'F'],
            handler: async () => {
              resetSpotlight();
              await handleAddFolder();
              ensureHome();
            },
          },
        ]
      : []),
    {
      id: 'add-remote-database',
      label: 'Add Remote Database',
      icon: <IconDatabasePlus size={20} className={ICON_CLASSES} />,
      hotkey: [control, 'D'],
      handler: () => {
        openDataWizardModal('remote-config');
        resetSpotlight();
        ensureHome();
      },
    },
  ];

  const scriptGroupActions: Action[] = [
    {
      id: 'create-new-script',
      label: `New ${SCRIPT_DISPLAY_NAME}`,
      icon: <IconPlus size={20} className={ICON_CLASSES} />,
      hotkey: [control, option, 'N'],
      handler: async () => {
        const newEmptyScript = createSQLScript();
        getOrCreateTabFromScript(newEmptyScript, true);
        resetSpotlight();
        ensureHome();
      },
    },
    {
      id: 'create-new-comparison',
      label: 'New Comparison',
      icon: <IconScale size={20} className={ICON_CLASSES} />,
      hotkey: [control, option, 'C'],
      handler: async () => {
        createComparisonTab({ setActive: true });
        resetSpotlight();
        ensureHome();
      },
    },
    {
      id: 'import-script',
      label: 'Import Queries',
      icon: <IconFileImport size={20} className={ICON_CLASSES} />,
      hotkey: [control, 'I'],
      handler: async () => {
        importSQLFiles();
        resetSpotlight();
        ensureHome();
      },
    },
    {
      id: 'import-script-from-url',
      label: 'Import From URL',
      icon: <IconFileImport size={20} className={ICON_CLASSES} />,
      handler: () => {
        openImportScriptModal();
        resetSpotlight();
      },
    },
    {
      id: 'format-sql',
      label: 'Format SQL',
      icon: <IconCode size={20} className={ICON_CLASSES} />,
      hotkey: [control, 'Shift', 'F'],
      handler: () => {
        // Get the active tab and check if it's a script tab
        const { activeTabId, tabs, sqlScripts: scripts } = useAppStore.getState();
        if (!activeTabId) {
          showError({
            title: 'No active tab',
            message: '',
            autoClose: 2000,
          });
          Spotlight.close();
          return;
        }

        const activeTab = tabs.get(activeTabId);
        if (!activeTab || activeTab.type !== 'script') {
          showWarning({
            title: 'Format SQL is only available in SQL script tabs',
            message: '',
            autoClose: 3000,
          });
          Spotlight.close();
          return;
        }

        const sqlScript = scripts.get(activeTab.sqlScriptId);
        if (!sqlScript) {
          showError({
            title: 'No SQL script found',
            message: '',
            autoClose: 2000,
          });
          Spotlight.close();
          return;
        }

        formatAndApplySQLScript(sqlScript);
        Spotlight.close();
      },
    },
  ];

  const helpGroupActions: Action[] = [
    {
      id: 'documentation',
      label: 'Documentation',
      icon: <IconBooks size={20} className={ICON_CLASSES} />,
      handler: () => {
        window.open(APP_DOCS_URL, '_blank', 'noopener,noreferrer');
      },
    },
    {
      id: 'report-issue',
      label: 'Report an Issue',
      icon: <IconFileSad size={20} className={ICON_CLASSES} />,
      handler: () => {
        window.open(APP_OPEN_ISSUES_URL, '_blank', 'noopener,noreferrer');
      },
    },
    {
      id: 'keyboard-shortcuts',
      label: 'Keyboard Shortcuts',
      icon: <IconKeyboard size={20} className={ICON_CLASSES} />,
      disabled: true,

      handler: () => {},
    },
  ];

  const tabActions: Action[] = [
    {
      id: 'close-all-tabs',
      label: 'Close All Tabs',
      icon: <IconLayoutGridRemove size={20} className={ICON_CLASSES} />,
      handler: () => {
        const { tabOrder } = useAppStore.getState();
        if (tabOrder.length > 0) {
          deleteTab(tabOrder);
        }
        Spotlight.close();
      },
    },
    {
      id: 'close-all-but-active-tab',
      label: 'Close All But Active Tab',
      icon: <IconLayoutNavbarCollapse size={20} className={ICON_CLASSES} />,
      handler: () => {
        const { tabOrder, activeTabId } = useAppStore.getState();
        if (tabOrder.length > 0 && activeTabId) {
          const tabsToClose = tabOrder.filter((tabId) => tabId !== activeTabId);
          if (tabsToClose.length > 0) {
            deleteTab(tabsToClose);
          }
        }
        Spotlight.close();
      },
    },
  ];

  const quickActions: Action[] = [...scriptGroupActions, ...dataSourceGroupActions, ...tabActions];

  const searchModeActions: Action[] = [
    {
      id: 'search-scripts',
      label: `Search for ${SCRIPT_GROUP_DISPLAY_NAME}`,
      hotkey: [SEARCH_PREFIXES.script],
      handler: () => {
        setSearchValue(SEARCH_PREFIXES.script);
        searchInputRef.current?.focus();
      },
    },
    {
      id: 'search-data-sources',
      label: `Search for ${DATA_SOURCE_GROUP_DISPLAY_NAME}`,
      hotkey: [SEARCH_PREFIXES.dataSource],
      handler: () => {
        setSearchValue(SEARCH_PREFIXES.dataSource);
        searchInputRef.current?.focus();
      },
    },
  ];

  const renderHomeView = () => {
    const filteredQuickActions = filterActions(quickActions, searchValue);
    const filteredNavigateActions = filterActions(navigateActions, searchValue);
    const filteredHelpActions = filterActions(helpGroupActions, searchValue);

    // Only include script actions themselves if we have search, including fallback
    const filteredScripts = searchValue
      ? getFilteredScriptActions(scriptActions, searchValue, true)
      : [];

    // Only show data sources if there is a search query
    const filteredDataSources = searchValue ? filterActions(dataSourceActions, searchValue) : [];
    const filteredComparisons = searchValue ? filterActions(comparisonActions, searchValue) : [];

    return (
      <>
        {searchValue && (
          <>
            {filteredScripts.length > 0 &&
              renderActionsGroup(filteredScripts, SCRIPT_GROUP_DISPLAY_NAME)}
            {filteredComparisons.length > 0 &&
              renderActionsGroup(filteredComparisons, COMPARISON_GROUP_DISPLAY_NAME)}
            {filteredDataSources.length > 0 &&
              renderActionsGroup(filteredDataSources, DATA_SOURCE_GROUP_DISPLAY_NAME)}
          </>
        )}
        {filteredQuickActions.length > 0 &&
          renderActionsGroup(filteredQuickActions, 'Quick Actions')}
        {filteredNavigateActions.length > 0 &&
          renderActionsGroup(filteredNavigateActions, 'Navigate')}
        {filteredHelpActions.length > 0 && renderActionsGroup(filteredHelpActions, 'Help')}
      </>
    );
  };
  const renderDataSourcesView = () => {
    const filteredActions = filterActions(dataSourceGroupActions, searchValue);
    const filteredDataSources = filterActions(dataSourceActions, searchValue);
    // Can't be empty but ok...
    return (
      <>
        {filteredActions.length > 0 && renderActionsGroup(filteredActions, 'Data Sources')}
        {filteredDataSources.length > 0 &&
          renderActionsGroup(filteredDataSources, 'Recent Data Sources')}
      </>
    );
  };

  const renderScriptsView = () => {
    const filteredActions = filterActions(scriptGroupActions, searchValue);
    const filteredScripts = filterActions(scriptActions, searchValue);
    const filteredComparisons = filterActions(comparisonActions, searchValue);

    // Can't be empty but ok...
    return (
      <>
        {filteredActions.length > 0 &&
          renderActionsGroup(filteredActions, SCRIPT_GROUP_DISPLAY_NAME)}
        {filteredScripts.length > 0 && renderActionsGroup(filteredScripts, 'Recent Queries')}
        {filteredComparisons.length > 0 &&
          renderActionsGroup(filteredComparisons, COMPARISON_GROUP_DISPLAY_NAME)}
      </>
    );
  };

  const getCurrentView = () => {
    // Help actions only
    if (searchValue.endsWith(SEARCH_SUFFIXES.mode)) {
      return renderActionsGroup(searchModeActions, 'Modes');
    }

    // Data source actions only (doesn't include group actions)
    if (searchValue.startsWith(SEARCH_PREFIXES.dataSource)) {
      const filteredDataSources = filterActions(dataSourceActions, searchValue);
      return renderActionsGroup(filteredDataSources, DATA_SOURCE_GROUP_DISPLAY_NAME);
    }

    // Script actions only (doesn't include group actions)
    if (searchValue.startsWith(SEARCH_PREFIXES.script)) {
      const filteredScripts = getFilteredScriptActions(scriptActions, searchValue, true);
      return renderActionsGroup(filteredScripts, SCRIPT_GROUP_DISPLAY_NAME);
    }

    // Full blow "view" (subpage), similar to above but with group actions
    switch (spotlightView) {
      case 'dataSources':
        return renderDataSourcesView();
      case 'scripts':
        return renderScriptsView();
      default:
        return renderHomeView();
    }
  };

  useEffect(() => {
    searchInputRef.current?.focus();
    setSearchValue('');
  }, [spotlightView]);

  const handleSpotlightKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') {
      return;
    }
    if (spotlightView === 'home') {
      return resetSpotlight();
    }

    if (['scripts', 'dataSources'].includes(spotlightView)) {
      return setSpotlightView('home');
    }
  };

  return (
    <>
      <Spotlight.Root
        closeOnActionTrigger={false}
        onSpotlightClose={resetSpotlight}
        onQueryChange={setSearchValue}
        query={searchValue}
        size={460}
        top={10}
        closeOnEscape={false}
      >
        <SpotlightBreadcrumbs currentView={spotlightView} onNavigate={setSpotlightView} />
        <Spotlight.Search
          data-testid={setDataTestId('spotlight-search')}
          ref={searchInputRef}
          value={searchValue}
          onKeyDown={handleSpotlightKeyPress}
          placeholder={getSpotlightSearchPlaceholder(spotlightView)}
          size="19"
          classNames={{
            input:
              'text-sm leading-none px-4 placeholder-textTertiary-light dark:placeholder-textTertiary-dark',
            wrapper: 'mb-2',
          }}
        />
        <Spotlight.ActionsList data-testid={setDataTestId('spotlight-menu')}>
          {spotlightView === 'home' && !searchValue.endsWith(SEARCH_SUFFIXES.mode) && (
            <Group gap={4} c="text-secondary" className="px-4 text-sm mb-4">
              Type{' '}
              <Text
                bg="background-secondary"
                className="p-0.5 px-2 rounded-full"
                c="text-secondary"
              >
                ?
              </Text>{' '}
              for help and tips
            </Group>
          )}
          <div className="px-4 flex flex-col gap-2">{getCurrentView()}</div>
          <div className="h-4"></div>
        </Spotlight.ActionsList>
      </Spotlight.Root>
    </>
  );
};
