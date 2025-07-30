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
  showMotherDuckDbs: boolean;
  motherDuckNodes: TreeNodeData<DataExplorerNodeTypeMap>[];
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
  showMotherDuckDbs,
  motherDuckNodes,
  initialExpandedState,
  searchExpandedState,
  extraData,
  hasActiveElement,
}: DataExplorerContentProps) => {
  const expandedState = { ...initialExpandedState, ...searchExpandedState };

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

        {/* Remote databases section */}
        {showRemoteDbs && remoteDbNodes.length > 0 && (
          <DataExplorerSection
            title="Remote Databases"
            nodes={remoteDbNodes}
            initialExpandedState={expandedState}
            extraData={extraData}
            dataTestIdPrefix="data-explorer-remote"
            hasActiveElement={hasActiveElement}
          />
        )}

        {/* MotherDuck section */}
        {showMotherDuckDbs && motherDuckNodes.length > 0 && (
          <DataExplorerSection
            title="MotherDuck"
            nodes={motherDuckNodes}
            initialExpandedState={expandedState}
            extraData={extraData}
            dataTestIdPrefix="data-explorer-motherduck"
            hasActiveElement={hasActiveElement}
          />
        )}
      </Stack>
    </div>
  );
};
