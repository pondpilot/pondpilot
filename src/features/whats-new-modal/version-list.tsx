import { ScrollArea, Text, UnstyledButton } from '@mantine/core';
import { isVersionGreater } from '@utils/compare-versions';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';

import { GitHubReleaseData } from './types';

interface VersionListProps {
  releases: GitHubReleaseData[];
  selectedVersion: string | null;
  onSelect: (tagName: string) => void;
  lastSeenVersion: string | null;
}

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const VersionList = ({
  releases,
  selectedVersion,
  onSelect,
  lastSeenVersion,
}: VersionListProps) => {
  return (
    <ScrollArea
      h={640}
      className="min-w-[180px] max-w-[180px] border-r border-borderPrimary-light dark:border-borderPrimary-dark"
      data-testid={setDataTestId('whats-new-version-list')}
    >
      {releases.map((release) => {
        const isSelected = release.tag_name === selectedVersion;
        const isNew =
          lastSeenVersion != null && isVersionGreater(release.tag_name, lastSeenVersion);

        return (
          <UnstyledButton
            key={release.tag_name}
            onClick={() => onSelect(release.tag_name)}
            className={cn(
              'w-full px-3 py-2 transition-colors',
              isSelected
                ? 'bg-backgroundSecondary-light dark:bg-backgroundSecondary-dark'
                : 'hover:bg-backgroundSecondary-light/50 dark:hover:bg-backgroundSecondary-dark/50',
            )}
            data-testid={setDataTestId(`whats-new-version-item-${release.tag_name}`)}
          >
            <div className="flex items-center gap-1.5">
              <Text size="sm" fw={isSelected ? 600 : 400} c="text-primary" truncate>
                {release.tag_name}
              </Text>
              {isNew && (
                <span
                  className="inline-block w-2 h-2 rounded-full bg-blue-500 shrink-0"
                  data-testid={setDataTestId(`whats-new-badge-${release.tag_name}`)}
                />
              )}
            </div>
            <Text size="xs" c="text-tertiary">
              {formatDate(release.published_at)}
            </Text>
          </UnstyledButton>
        );
      })}
    </ScrollArea>
  );
};
