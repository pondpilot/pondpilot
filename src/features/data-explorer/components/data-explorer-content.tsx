import { TreeNodeData } from '@components/explorer-tree';
import { Stack } from '@mantine/core';

import { DataExplorerSection } from './data-explorer-section';
import { DataExplorerContext, DataExplorerNodeTypeMap } from '../model';

type DataExplorerContentProps = {
  showSystemDb: boolean;
  systemDbNode: TreeNodeData<DataExplorerNodeTypeMap>;
  showFileSystem: boolean;
  fileSystemNodes: TreeNodeData<DataExplorerNodeTypeMap>[];
  showLocalDbs: boolean;
  localDbNodes: TreeNodeData<DataExplorerNodeTypeMap>[];
  showRemoteDbs: boolean;
  remoteDbNodes: TreeNodeData<DataExplorerNodeTypeMap>[];
  showIcebergCatalogs: boolean;
  icebergCatalogNodes: TreeNodeData<DataExplorerNodeTypeMap>[];
  showMotherDuck: boolean;
  motherduckNodes: TreeNodeData<DataExplorerNodeTypeMap>[];
  initialExpandedState: Record<string, boolean>;
  searchExpandedState: Record<string, boolean>;
  extraData: DataExplorerContext;
  hasActiveElement: boolean;
};

export const DataExplorerContent = ({
  showSystemDb,
  systemDbNode,
  showFileSystem,
  fileSystemNodes,
  showLocalDbs,
  localDbNodes,
  showRemoteDbs,
  remoteDbNodes,
  showIcebergCatalogs,
  icebergCatalogNodes,
  showMotherDuck,
  motherduckNodes,
  initialExpandedState,
  searchExpandedState,
  extraData,
  hasActiveElement,
}: DataExplorerContentProps) => {
  const expandedState = { ...initialExpandedState, ...searchExpandedState };

  // Combine remote databases, iceberg catalogs, and MotherDuck into one section
  const showRemoteSection = showRemoteDbs || showIcebergCatalogs || showMotherDuck;
  const remoteDataSourceNodes = [...remoteDbNodes, ...icebergCatalogNodes, ...motherduckNodes];

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden">
      <Stack gap="xs" className="pt-2 pb-4">
        {/* System database (pondpilot) - always visible */}
        {showSystemDb && (
          <DataExplorerSection
            nodes={[systemDbNode]}
            initialExpandedState={expandedState}
            extraData={extraData}
            dataTestIdPrefix="data-explorer-system"
            hasActiveElement={hasActiveElement}
          />
        )}

        {/* File system tree */}
        {showFileSystem && fileSystemNodes.length > 0 && (
          <DataExplorerSection
            title="Local Files"
            nodes={fileSystemNodes}
            initialExpandedState={expandedState}
            extraData={extraData}
            dataTestIdPrefix="data-explorer-fs"
            hasActiveElement={hasActiveElement}
          />
        )}

        {/* Local databases section */}
        {showLocalDbs && localDbNodes.length > 0 && (
          <DataExplorerSection
            title="Local Databases"
            nodes={localDbNodes}
            initialExpandedState={expandedState}
            extraData={extraData}
            dataTestIdPrefix="data-explorer-local"
            hasActiveElement={hasActiveElement}
          />
        )}

        {/* Remote data sources section (remote databases + iceberg catalogs) */}
        {showRemoteSection && remoteDataSourceNodes.length > 0 && (
          <DataExplorerSection
            title="Remote Data Sources"
            nodes={remoteDataSourceNodes}
            initialExpandedState={expandedState}
            extraData={extraData}
            dataTestIdPrefix="data-explorer-remote"
            hasActiveElement={hasActiveElement}
          />
        )}
      </Stack>
    </div>
  );
};
