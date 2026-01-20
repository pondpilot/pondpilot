import { ScrollArea, Text } from '@mantine/core';
import { ScriptVersion, ScriptVersionGroup } from '@models/script-version';

import { VersionDateHeader } from './version-date-header';
import { VersionItem } from './version-item';

export type SelectionMode = 'preview' | 'compare';

interface VersionListProps {
  versionGroups: ScriptVersionGroup[];
  selectionMode: SelectionMode;
  isVersionSelected: (version: ScriptVersion) => boolean;
  isVersionCompareTarget: (version: ScriptVersion) => boolean;
  currentVersionId: ScriptVersion['id'] | null;
  onSelectVersion: (version: ScriptVersion) => void;
}

export const VersionList = ({
  versionGroups,
  selectionMode,
  isVersionSelected,
  isVersionCompareTarget,
  currentVersionId,
  onSelectVersion,
}: VersionListProps) => {
  if (versionGroups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Text className="text-textSecondary-light dark:text-textSecondary-dark" ta="center">
          No version history available
        </Text>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="pr-2 space-y-1">
        {versionGroups.map((group) => (
          <div key={group.date.toISOString()}>
            <VersionDateHeader date={group.date} />
            <div className="space-y-1">
              {group.versions.map((version) => (
                <VersionItem
                  key={version.id}
                  version={version}
                  isSelected={isVersionSelected(version)}
                  isCompareTarget={isVersionCompareTarget(version)}
                  compareMode={selectionMode === 'compare'}
                  isCurrent={currentVersionId === version.id}
                  onSelect={onSelectVersion}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};
