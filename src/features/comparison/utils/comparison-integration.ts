import { showWarning } from '@components/app-notifications';
import { TreeNodeMenuItemType, TreeNodeData, TreeNodeMenuType } from '@components/explorer-tree';
import { createComparison } from '@controllers/comparison';
import {
  setComparisonViewingResults,
  updateComparisonConfig,
  updateSchemaComparison,
  getOrCreateTabFromComparison,
} from '@controllers/tab/comparison-tab-controller';
import {
  DataExplorerNodeMap,
  DataExplorerNodeTypeMap,
  isDBNodeInfo,
  isFileNodeInfo,
} from '@features/data-explorer/model';
import { Comparison, ComparisonConfig, ComparisonSource } from '@models/comparison';
import { AnyDataSource, AnyFlatFileDataSource, PersistentDataSourceId } from '@models/data-source';
import { TabId } from '@models/tab';
import { useAppStore } from '@store/app-store';

import { dataSourceToComparisonSource } from './source-selection';

export const COMPARISON_DRAG_MIME_TYPE = 'application/x-pondpilot-comparison-source';
export const COMPARISON_ANALYSIS_EVENT = 'pondpilot:comparison-request-analysis';

export const requestComparisonAnalysis = (tabId: TabId) => {
  window.dispatchEvent(
    new CustomEvent(COMPARISON_ANALYSIS_EVENT, {
      detail: { tabId },
    }),
  );
};

export const DEFAULT_COMPARISON_CONFIG: ComparisonConfig = {
  sourceA: null,
  sourceB: null,
  joinColumns: [],
  joinKeyMappings: {},
  columnMappings: {},
  excludedColumns: [],
  filterMode: 'common',
  commonFilter: null,
  filterA: null,
  filterB: null,
  showOnlyDifferences: true,
  compareMode: 'strict',
};

function mergeConfig(base: ComparisonConfig | null): ComparisonConfig {
  return base ? { ...DEFAULT_COMPARISON_CONFIG, ...base } : { ...DEFAULT_COMPARISON_CONFIG };
}

export function setComparisonDragData(dataTransfer: DataTransfer | null, source: ComparisonSource) {
  if (!dataTransfer) return;
  try {
    const payload = JSON.stringify(source);
    dataTransfer.setData(COMPARISON_DRAG_MIME_TYPE, payload);
    dataTransfer.effectAllowed = 'copy';
  } catch (error) {
    console.error('Failed to serialize comparison drag payload', error);
  }
}

export function hasComparisonDragData(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes(COMPARISON_DRAG_MIME_TYPE);
}

/**
 * Validates that an unknown value is a valid ComparisonSource
 */
function isValidComparisonSource(value: unknown): value is ComparisonSource {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  // Validate type field
  if (typeof candidate.type !== 'string') {
    return false;
  }

  // Validate based on source type
  if (candidate.type === 'table') {
    // tableName is required
    if (typeof candidate.tableName !== 'string' || candidate.tableName.length === 0) {
      return false;
    }
    // schemaName and databaseName are optional but must be strings if present
    if (candidate.schemaName !== undefined && typeof candidate.schemaName !== 'string') {
      return false;
    }
    if (candidate.databaseName !== undefined && typeof candidate.databaseName !== 'string') {
      return false;
    }
    return true;
  }

  if (candidate.type === 'query') {
    // sql and alias are required
    if (typeof candidate.sql !== 'string' || candidate.sql.length === 0) {
      return false;
    }
    if (typeof candidate.alias !== 'string' || candidate.alias.length === 0) {
      return false;
    }
    return true;
  }

  // Unknown type
  return false;
}

export function parseComparisonDragData(
  dataTransfer: DataTransfer | null,
): ComparisonSource | null {
  if (!dataTransfer) return null;
  if (!hasComparisonDragData(dataTransfer)) {
    return null;
  }
  try {
    const payload = dataTransfer.getData(COMPARISON_DRAG_MIME_TYPE);
    if (!payload) {
      return null;
    }
    const parsed = JSON.parse(payload);
    if (!isValidComparisonSource(parsed)) {
      console.warn('Invalid comparison source structure in drag data', parsed);
      return null;
    }
    return parsed;
  } catch (error) {
    console.error('Failed to parse comparison drag payload', error);
    return null;
  }
}

export function getComparisonSourceDragProps(
  source: ComparisonSource,
  options?: { preventDrop?: boolean },
): React.HTMLAttributes<HTMLDivElement> {
  const props: React.HTMLAttributes<HTMLDivElement> = {
    draggable: true,
    onDragStart: (event) => setComparisonDragData(event.dataTransfer, source),
  };

  if (options?.preventDrop) {
    props.onDragOver = (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'none';
    };
  }

  return props;
}

function getActiveComparisonContext(): {
  tabId: TabId | null;
  comparison: Comparison | null;
  config: ComparisonConfig;
} {
  const state = useAppStore.getState();
  const { activeTabId, tabs, comparisons } = state;
  if (!activeTabId) {
    return { tabId: null, comparison: null, config: mergeConfig(null) };
  }

  const activeTab = tabs.get(activeTabId);
  if (!activeTab || activeTab.type !== 'comparison') {
    return { tabId: null, comparison: null, config: mergeConfig(null) };
  }

  const comparison = comparisons.get(activeTab.comparisonId) ?? null;
  const config = mergeConfig(comparison?.config ?? null);

  return { tabId: activeTab.id, comparison, config };
}

function shouldResetMappings(config: ComparisonConfig, slot: 'A' | 'B'): boolean {
  return slot === 'A' ? config.sourceA !== null : config.sourceB !== null;
}

export type ComparisonAssignmentResult = {
  status: 'created' | 'added' | 'replaced' | 'blocked';
  slot?: 'A' | 'B';
};

export function assignComparisonSource(
  source: ComparisonSource,
  preference: 'auto' | 'A' | 'B' = 'auto',
): ComparisonAssignmentResult {
  const { tabId, comparison, config } = getActiveComparisonContext();

  if (!tabId || !comparison) {
    const newComparison = createComparison();
    const tab = getOrCreateTabFromComparison(newComparison, true);
    updateComparisonConfig(tab.id, {
      ...DEFAULT_COMPARISON_CONFIG,
      sourceA: source,
      sourceB: null,
      joinColumns: [],
      joinKeyMappings: {},
      columnMappings: {},
      excludedColumns: [],
    });
    setComparisonViewingResults(tab.id, false);
    updateSchemaComparison(tab.id, null);
    return { status: 'created', slot: 'A' };
  }

  let targetSlot: 'A' | 'B' | null = null;

  if (preference === 'A' || preference === 'B') {
    targetSlot = preference;
  } else if (!config.sourceA) {
    targetSlot = 'A';
  } else if (!config.sourceB) {
    targetSlot = 'B';
  }

  if (!targetSlot) {
    showWarning({
      title: 'Comparison slots full',
      message: 'Both sources are already selected. Choose "Replace Source" to update a slot.',
    });
    return { status: 'blocked' };
  }

  const update: Partial<ComparisonConfig> =
    targetSlot === 'A' ? { sourceA: source } : { sourceB: source };

  const replacingExisting = shouldResetMappings(config, targetSlot);

  if (replacingExisting) {
    update.joinColumns = [];
    update.joinKeyMappings = {};
    update.columnMappings = {};
    update.excludedColumns = [];
  }

  updateComparisonConfig(tabId, update);
  setComparisonViewingResults(tabId, false);
  updateSchemaComparison(tabId, null);

  const nextConfig = {
    ...config,
    ...update,
    joinColumns: update.joinColumns ?? config.joinColumns,
    joinKeyMappings: update.joinKeyMappings ?? config.joinKeyMappings,
    columnMappings: update.columnMappings ?? config.columnMappings,
    excludedColumns: update.excludedColumns ?? config.excludedColumns,
  };

  if (nextConfig.sourceA && nextConfig.sourceB) {
    requestComparisonAnalysis(tabId);
  }

  return {
    status: replacingExisting ? 'replaced' : 'added',
    slot: targetSlot,
  };
}

export function createComparisonFromSources(
  sources: [ComparisonSource, ComparisonSource],
): ComparisonAssignmentResult {
  const [sourceA, sourceB] = sources;
  const comparison = createComparison();
  const tab = getOrCreateTabFromComparison(comparison, true);

  updateComparisonConfig(tab.id, {
    ...DEFAULT_COMPARISON_CONFIG,
    sourceA,
    sourceB,
  });
  setComparisonViewingResults(tab.id, false);
  updateSchemaComparison(tab.id, null);
  requestComparisonAnalysis(tab.id);

  return { status: 'created', slot: 'A' };
}

export function getComparisonSourceFromNode(
  node: TreeNodeData<DataExplorerNodeTypeMap>,
  context: {
    nodeMap: DataExplorerNodeMap;
    flatFileSources: Map<PersistentDataSourceId, AnyFlatFileDataSource>;
    dataSources: Map<PersistentDataSourceId, AnyDataSource>;
  },
): ComparisonSource | null {
  const info = context.nodeMap.get(node.value);
  if (!info) {
    return null;
  }

  if (isFileNodeInfo(info)) {
    if (!info.dataSourceId) {
      return null;
    }
    const dataSource = context.flatFileSources.get(info.dataSourceId);
    if (!dataSource) {
      return null;
    }
    return dataSourceToComparisonSource(dataSource);
  }

  if (isDBNodeInfo(info)) {
    if (!info.db || !info.schemaName || !info.objectName) {
      return null;
    }
    const dbSource = context.dataSources.get(info.db);
    if (!dbSource || (dbSource.type !== 'attached-db' && dbSource.type !== 'remote-db')) {
      return null;
    }
    return {
      type: 'table',
      tableName: info.objectName,
      schemaName: info.schemaName,
      databaseName: dbSource.dbName,
    };
  }

  return null;
}

export function buildComparisonMenuItemsForSource(
  source: ComparisonSource,
): TreeNodeMenuItemType<TreeNodeData<DataExplorerNodeTypeMap>>[] {
  const { comparison, config } = getActiveComparisonContext();
  const items: TreeNodeMenuItemType<TreeNodeData<DataExplorerNodeTypeMap>>[] = [];

  const submenuItems: TreeNodeMenuItemType<TreeNodeData<DataExplorerNodeTypeMap>>[] = [];

  const appendSlotOption = (label: string, slot: 'A' | 'B') => {
    submenuItems.push({
      label,
      onClick: () => {
        assignComparisonSource(source, slot);
      },
    });
  };

  if (!comparison) {
    submenuItems.push({
      label: 'New comparison',
      onClick: () => {
        assignComparisonSource(source, 'auto');
      },
    });
  } else {
    if (!config.sourceA) {
      appendSlotOption('Add as Source A', 'A');
    }

    if (!config.sourceB) {
      appendSlotOption('Add as Source B', 'B');
    }

    if (config.sourceA && config.sourceB) {
      submenuItems.push(
        {
          label: 'Replace Source A',
          onClick: () => {
            assignComparisonSource(source, 'A');
          },
        },
        {
          label: 'Replace Source B',
          onClick: () => {
            assignComparisonSource(source, 'B');
          },
        },
      );
    }
  }

  if (submenuItems.length === 0) {
    return items;
  }

  items.push({
    label: 'Compare',
    onClick: () => {},
    children: submenuItems,
  });

  return items;
}

export function buildComparisonMenuSectionForSources(
  sources: ComparisonSource[],
): TreeNodeMenuType<TreeNodeData<DataExplorerNodeTypeMap>> {
  if (sources.length !== 2) {
    return [];
  }
  return [
    {
      children: [
        {
          label: 'Compare Selected',
          onClick: () => {
            createComparisonFromSources([sources[0], sources[1]] as [
              ComparisonSource,
              ComparisonSource,
            ]);
          },
        },
      ],
    },
  ];
}
