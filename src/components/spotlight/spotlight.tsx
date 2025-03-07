import { useAppContext } from '@features/app-context';
import { Group, Text, useMantineColorScheme } from '@mantine/core';
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
  IconBrush,
  IconSun,
  IconMoon,
  IconSettings,
  IconFileSad,
  IconBooks,
  IconKeyboard,
  IconCsv,
  IconJson,
  IconTable,
} from '@tabler/icons-react';
import { useFileHandlers } from '@hooks/useUploadFilesHandlers';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@store/app-store';
import { HotkeyPill } from '@components/hotkey-pill';
import { cn } from '@utils/ui/styles';
import { useModifier } from '@hooks/useModifier';
import { useNavigate } from 'react-router-dom';
import { SpotlightView } from './models';
import { getSpotlightSearchPlaceholder, filterActions } from './utlis';
import { SpotlightBreadcrumbs } from './components';

interface Action {
  id: string;
  label: string;
  handler: () => void;
  icon?: React.ReactNode;
  hotkey?: Array<string | React.ReactNode>;
  disabled?: boolean;
}

export const SpotlightMenu = () => {
  /**
   * Common hooks
   */
  const { onCreateQueryFile, importSQLFiles, onOpenQuery, onTabSwitch, onOpenView } =
    useAppContext();
  const { setColorScheme } = useMantineColorScheme();
  const { handleAddSource } = useFileHandlers();
  const { command, option } = useModifier();
  const navigate = useNavigate();

  /**
   * Store access
   */
  const queries = useAppStore((state) => state.queries);
  const views = useAppStore((state) => state.views);
  const sessionFiles = useAppStore((state) => state.sessionFiles);

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
  const iconClasses = 'text-textSecondary-light dark:text-textSecondary-dark';

  const getIcon = useCallback(
    (id: string | undefined) => {
      const iconProps = {
        size: 20,
        className: iconClasses,
      };
      const fileExt = sessionFiles?.sources.find((f) => f.name === id)?.ext as string;

      const iconsMap = {
        csv: <IconCsv {...iconProps} />,
        json: <IconJson {...iconProps} />,
      }[fileExt];
      return iconsMap || <IconTable {...iconProps} />;
    },
    [sessionFiles],
  );

  const navigateActions: Action[] = [
    {
      id: 'data-sources',
      label: 'Data Sources',
      handler: () => setSpotlightView('dataSources'),
      icon: <IconDatabase size={20} className={iconClasses} />,
    },
    {
      id: 'queries',
      label: 'Queries',
      handler: () => setSpotlightView('queries'),
      icon: <IconCode size={20} className={iconClasses} />,
    },
    {
      id: 'settings',
      label: 'Settings',
      handler: () => {
        setSpotlightView('settings');
        setSearchValue('');
      },
      icon: <IconSettings size={20} className={iconClasses} />,
    },
  ];

  const viewActions: Action[] = views.map((view) => ({
    id: view,
    label: view,
    icon: getIcon(view),
    handler: () => {
      onOpenView(view);
      onTabSwitch({
        path: view,
        mode: 'view',
        stable: true,
      });
      Spotlight.close();
    },
  }));

  const mappedQueries = queries.map((query) => ({
    id: query.path,
    label: query.path || '',
    icon: <IconCode size={20} className={iconClasses} />,
    handler: () => {
      onOpenQuery(query.path);
      onTabSwitch({
        path: query.handle.name,
        mode: 'query',
        stable: true,
      });
      Spotlight.close();
    },
  }));

  const dataSourcesActions: Action[] = [
    {
      id: 'add-file',
      label: 'Add File',
      icon: <IconFilePlus size={20} className={iconClasses} />,
      hotkey: [<IconChevronUp size={20} />, 'F'],
      handler: () => {
        handleAddSource('file')();
        resetSpotlight();
      },
    },
    {
      id: 'add-folder',
      label: 'Add Folder',
      icon: <IconFolderPlus size={20} className={iconClasses} />,
      hotkey: [option, command, 'F'],
      handler: () => {
        handleAddSource('folder')();
        resetSpotlight();
      },
    },
    {
      id: 'add-duckdb-db',
      label: 'Add DuckDB Database',
      icon: <IconDatabasePlus size={20} className={iconClasses} />,
      hotkey: [<IconChevronUp size={20} />, 'D'],
      handler: () => {
        handleAddSource('file', ['.duckdb'])();
        resetSpotlight();
      },
    },
  ];

  const queriesActions: Action[] = [
    {
      id: 'new-query',
      label: 'New Query',
      icon: <IconPlus size={20} className={iconClasses} />,
      hotkey: [option, 'N'],
      handler: () => {
        onCreateQueryFile({ entities: [{ name: 'query-name.sql' }] });
        resetSpotlight();
      },
    },
    {
      id: 'import-query',
      label: 'Import Query',
      icon: <IconFileImport size={20} className={iconClasses} />,
      hotkey: [<IconChevronUp size={20} />, 'I'],
      handler: () => {
        importSQLFiles();
        resetSpotlight();
      },
    },
  ];

  const settingsActions: Action[] = [
    {
      id: 'theme',
      label: 'Theme',
      icon: <IconBrush size={20} className={iconClasses} />,
      handler: () => {
        setSpotlightView('settings-theme');
        setSearchValue('');
      },
    },
    {
      id: 'general',
      label: 'General',
      icon: <IconSettings size={20} className={iconClasses} />,
      handler: () => {
        navigate('/settings');
        Spotlight.close();
      },
    },
  ];

  const helpActions: Action[] = [
    {
      id: 'documentation',
      label: 'Documentation',
      icon: <IconBooks size={20} className={iconClasses} />,
      handler: () => {
        window.open(
          'https://github.com/pondpilot/pondpilot/blob/main/README.md',
          '_blank',
          'noopener,noreferrer',
        );
      },
    },
    {
      id: 'report-issue',
      label: 'Report an Issue',
      icon: <IconFileSad size={20} className={iconClasses} />,
      handler: () => {
        window.open(
          'https://github.com/pondpilot/pondpilot/issues/new/choose',
          '_blank',
          'noopener,noreferrer',
        );
      },
    },
    {
      id: 'keyboard-shortcuts',
      label: 'Keyboard Shortcuts',
      icon: <IconKeyboard size={20} className={iconClasses} />,
      disabled: true,

      handler: () => {},
    },
  ];

  const themeActions: Action[] = [
    {
      id: 'theme-light',
      label: 'Light',
      icon: <IconSun size={20} className={iconClasses} />,
      handler: () => {
        setColorScheme('light');
        Spotlight.close();
      },
    },
    {
      id: 'theme-dark',
      label: 'Dark',
      icon: <IconMoon size={20} className={iconClasses} />,
      handler: () => {
        setColorScheme('dark');
        Spotlight.close();
      },
    },
  ];

  const quickActions: Action[] = [...queriesActions, ...dataSourcesActions];

  const getQueryActions = () => {
    const name = searchValue.replace('&', '');

    if (name && !mappedQueries.some((q) => q.label.toLowerCase().includes(name.toLowerCase()))) {
      mappedQueries.push({
        id: 'create-new',
        label: `Create "${name}" query`,
        icon: <IconPlus size={20} className={iconClasses} />,
        handler: () => {
          onCreateQueryFile({ entities: [{ name }] });
          Spotlight.close();
        },
      });
    }

    return mappedQueries;
  };

  const modeActions: Action[] = [
    {
      id: 'search-queries',
      label: 'Search for Queries',
      hotkey: ['&'],
      handler: () => {
        setSearchValue('&');
        searchInputRef.current?.focus();
      },
    },
    {
      id: 'search-views',
      label: 'Search for Views',
      hotkey: ['/'],
      handler: () => {
        setSearchValue('/');
        searchInputRef.current?.focus();
      },
    },
  ];

  const renderFilteredActions = (actions: Action[], label: string) => {
    if (!actions.length) {
      return <Spotlight.Empty>Nothing found...</Spotlight.Empty>;
    }
    return (
      <Spotlight.ActionsGroup label={label} className="text-red-200">
        {actions.map((action) => (
          <Spotlight.Action disabled={action.disabled} key={action.id} onClick={action.handler}>
            <Group
              justify="space-between"
              className={cn('w-full', action.disabled && 'opacity-50')}
            >
              <Group className="gap-2">
                {action.icon ? <div>{action.icon}</div> : undefined}
                {action.label}
              </Group>
              <Group>
                {action.hotkey ? (
                  <HotkeyPill variant="secondary" value={action.hotkey} />
                ) : undefined}
              </Group>
            </Group>
          </Spotlight.Action>
        ))}
      </Spotlight.ActionsGroup>
    );
  };

  const renderHomeView = () => {
    const filteredQuickActions = filterActions(quickActions, searchValue);
    const filteredNavigateActions = filterActions(navigateActions, searchValue);
    const filteredHelpActions = filterActions(helpActions, searchValue);
    const filteredQueries = searchValue
      ? getQueryActions().filter((query) =>
          query.label.toLowerCase().includes(searchValue.toLowerCase()),
        )
      : [];
    const filteredViews = searchValue
      ? viewActions.filter((view) => view.label.toLowerCase().includes(searchValue.toLowerCase()))
      : [];

    if (
      !filteredQuickActions.length &&
      !filteredNavigateActions.length &&
      !filteredQueries.length &&
      !filteredViews.length &&
      !filteredHelpActions.length &&
      !searchValue
    ) {
      return <Spotlight.Empty>Nothing found...</Spotlight.Empty>;
    }

    return (
      <>
        {searchValue && (
          <>
            <Spotlight.ActionsGroup label="Queries">
              {filteredQueries.length > 0 ? (
                filteredQueries.map((query) => (
                  <Spotlight.Action key={query.id} onClick={query.handler}>
                    <Group justify="space-between" className="w-full">
                      <Group className="gap-2">
                        {query.icon}
                        {query.label}
                      </Group>
                    </Group>
                  </Spotlight.Action>
                ))
              ) : (
                <Spotlight.Action
                  onClick={() => {
                    onCreateQueryFile({ entities: [{ name: searchValue }] });
                    resetSpotlight();
                  }}
                >
                  <Group className="gap-2">
                    <IconPlus size={20} className={iconClasses} />
                    Create &quot;{searchValue}&quot; query
                  </Group>
                </Spotlight.Action>
              )}
            </Spotlight.ActionsGroup>

            {filteredViews.length > 0 && (
              <Spotlight.ActionsGroup label="Views">
                {filteredViews.map((view) => (
                  <Spotlight.Action key={view.id} onClick={view.handler}>
                    <Group justify="space-between" className="w-full">
                      <Group className="gap-2">
                        {view.icon}
                        {view.label}
                      </Group>
                    </Group>
                  </Spotlight.Action>
                ))}
              </Spotlight.ActionsGroup>
            )}
          </>
        )}
        {filteredQuickActions.length > 0 &&
          renderFilteredActions(filteredQuickActions, 'Quick Actions')}
        {filteredNavigateActions.length > 0 &&
          renderFilteredActions(filteredNavigateActions, 'Navigate')}
        {filteredHelpActions.length > 0 && renderFilteredActions(filteredHelpActions, 'Help')}
      </>
    );
  };
  const renderDataSourcesView = () => {
    const filteredActions = filterActions([...dataSourcesActions, ...viewActions], searchValue);
    return (
      <>{filteredActions.length > 0 && renderFilteredActions(filteredActions, 'Data Sources')}</>
    );
  };

  const renderQueriesView = () => {
    const filteredActions = filterActions([...queriesActions, ...mappedQueries], searchValue);

    return <>{filteredActions.length > 0 && renderFilteredActions(filteredActions, 'Queries')}</>;
  };

  const renderSettingsView = () => {
    const filteredActions = filterActions(settingsActions, searchValue);

    return <>{filteredActions.length > 0 && renderFilteredActions(filteredActions, 'Settings')}</>;
  };

  const renderSettingsThemeView = () => {
    const filteredActions = filterActions(themeActions, searchValue);

    return <>{filteredActions.length > 0 && renderFilteredActions(filteredActions, 'Theme')}</>;
  };

  const getCurrentView = () => {
    if (searchValue.endsWith('?')) {
      return renderFilteredActions(modeActions, 'Modes');
    }

    const searchTerm = searchValue.slice(1).toLowerCase();

    if (searchValue.startsWith('/')) {
      const filteredViews = viewActions.filter((view) =>
        view.label.toLowerCase().includes(searchTerm),
      );
      return renderFilteredActions(filteredViews, 'Views');
    }

    if (searchValue.startsWith('&')) {
      const filteredQueries = getQueryActions().filter((query) =>
        query.label.toLowerCase().includes(searchTerm),
      );
      return renderFilteredActions(filteredQueries, 'Queries');
    }

    switch (spotlightView) {
      case 'dataSources':
        return renderDataSourcesView();
      case 'queries':
        return renderQueriesView();

      case 'settings':
        return renderSettingsView();

      case 'settings-theme':
        return renderSettingsThemeView();

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

    if (['queries', 'dataSources', 'settings'].includes(spotlightView)) {
      return setSpotlightView('home');
    }
    if (['settings-theme'].includes(spotlightView)) {
      return setSpotlightView('settings');
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
        <Spotlight.ActionsList>
          {spotlightView === 'home' && !searchValue.endsWith('?') && (
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
