import { Group, Text } from '@mantine/core';
import { Spotlight } from '@mantine/spotlight';
import {
  IconDatabase,
  IconCode,
  IconPlus,
  IconFileImport,
  IconFilePlus,
  IconFolderPlus,
  IconDatabasePlus,
  IconChevronUp,
  IconSettings,
  IconFileSad,
  IconBooks,
  IconKeyboard,
} from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useModifier } from '@hooks/useModifier';
import { useLocation, useNavigate } from 'react-router-dom';
import { setDataTestId } from '@utils/test-id';
import { useImportSQLFiles } from '@store/hooks';
import { APP_DOCS_URL, APP_OPEN_ISSUES_URL } from 'app-urls';
import { useLocalFilesOrFolders } from '@hooks/useLocalFilesOrFolders';
import {
  createSQLScript,
  getOrCreateTabFromAttachedDBObject,
  getOrCreateTabFromFlatFileDataSource,
  getOrCreateTabFromScript,
  useAppStore,
} from '@store/app-store';
import { ListViewIcon } from '@components/list-view-icon';
import { getFlatFileDataSourceName } from '@utils/navigation';
import {
  DATA_SOURCE_GROUP_DISPLAY_NAME,
  ICON_CLASSES,
  SCRIPT_DISPLAY_NAME,
  SCRIPT_GROUP_DISPLAY_NAME,
  SEARCH_PREFIXES,
  SEARCH_SUFFIXES,
} from './consts';
import { getSpotlightSearchPlaceholder, filterActions, getSearchTermFromValue } from './utlis';
import { SpotlightBreadcrumbs } from './components';
import { Action, SpotlightView } from './model';
import { renderActionsGroup } from './components/action';

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
  const { importSQLFiles } = useImportSQLFiles();
  const { handleAddFile, handleAddFolder } = useLocalFilesOrFolders();
  const { command, option } = useModifier();

  /**
   * Store access
   */
  const sqlScripts = useAppStore.use.sqlScripts();
  const dataSources = useAppStore.use.dataSources();
  const dataBaseMetadata = useAppStore.use.dataBaseMetadata();
  const localEntries = useAppStore.use.localEntries();

  /**
   * Local state
   */
  const [searchValue, setSearchValue] = useState('');
  const [spotlightView, setSpotlightView] = useState<SpotlightView>('home');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const resetSpotlight = () => {
    setSpotlightView('home');
    Spotlight.close();
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
    if (dataSource.type === 'attached-db') {
      // For databases we need to read all tables and views from metadata
      const dbMetadata = dataBaseMetadata.get(dataSource.dbName);

      if (!dbMetadata) {
        continue;
      }

      dbMetadata.schemas.forEach((schema) => {
        schema.objects.forEach((tableOrView) => {
          dataSourceActions.push({
            id: `open-data-source-${dataSource.id}-${tableOrView.name}`,
            label: tableOrView.label,
            icon: (
              <ListViewIcon
                iconType={tableOrView.type === 'table' ? 'db-table' : 'db-view'}
                size={20}
                className={ICON_CLASSES}
              />
            ),
            handler: () => {
              getOrCreateTabFromAttachedDBObject(
                dataSource,
                schema.name,
                tableOrView.name,
                tableOrView.type,
                true,
              );
              Spotlight.close();
              ensureHome();
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
      icon: <ListViewIcon iconType={dataSource.type} size={20} className={ICON_CLASSES} />,
      handler: () => {
        getOrCreateTabFromFlatFileDataSource(dataSource, true);
        Spotlight.close();
        ensureHome();
      },
    });
  }

  const scriptActions = Array.from(sqlScripts.values()).map((script) => ({
    id: `open-data-source-${script.id}`,
    label: `${script.name}.sql`,
    icon: <ListViewIcon iconType="code-file" size={20} className={ICON_CLASSES} />,
    handler: () => {
      getOrCreateTabFromScript(script.id, true);
      Spotlight.close();
      ensureHome();
    },
  }));

  const dataSourceGroupActions: Action[] = [
    {
      id: 'add-file',
      label: 'Add File',
      icon: <IconFilePlus size={20} className={ICON_CLASSES} />,
      hotkey: [<IconChevronUp size={20} />, 'F'],
      handler: () => {
        handleAddFile();
        resetSpotlight();
        ensureHome();
      },
    },
    {
      id: 'add-folder',
      label: 'Add Folder',
      icon: <IconFolderPlus size={20} className={ICON_CLASSES} />,
      hotkey: [option, command, 'F'],
      handler: () => {
        handleAddFolder();
        resetSpotlight();
        ensureHome();
      },
    },
    {
      id: 'add-duckdb-db',
      label: 'Add DuckDB Database',
      icon: <IconDatabasePlus size={20} className={ICON_CLASSES} />,
      hotkey: [<IconChevronUp size={20} />, 'D'],
      handler: () => {
        handleAddFile(['.duckdb']);
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
      hotkey: [option, 'N'],
      handler: async () => {
        const newEmptyScript = createSQLScript();
        getOrCreateTabFromScript(newEmptyScript, true);
        resetSpotlight();
        ensureHome();
      },
    },
    {
      id: 'import-script',
      label: 'Import Queries',
      icon: <IconFileImport size={20} className={ICON_CLASSES} />,
      hotkey: [<IconChevronUp size={20} />, 'I'],
      handler: async () => {
        importSQLFiles();
        resetSpotlight();
        ensureHome();
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

  const quickActions: Action[] = [...scriptGroupActions, ...dataSourceGroupActions];

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

    return (
      <>
        {searchValue && (
          <>
            {filteredScripts.length > 0 &&
              renderActionsGroup(filteredScripts, SCRIPT_GROUP_DISPLAY_NAME)}
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
    const filteredActions = filterActions(
      [...dataSourceGroupActions, ...dataSourceActions],
      searchValue,
    );
    // Can't be empty but ok...
    return <>{filteredActions.length > 0 && renderActionsGroup(filteredActions, 'Data Sources')}</>;
  };

  const renderScriptsView = () => {
    const filteredActions = filterActions([...scriptGroupActions, ...scriptActions], searchValue);

    // Can't be empty but ok...
    return (
      <>
        {filteredActions.length > 0 &&
          renderActionsGroup(filteredActions, SCRIPT_GROUP_DISPLAY_NAME)}
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
              <Text bg="background-secondary" className="p-0.5 px-2 rounded-full">
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
