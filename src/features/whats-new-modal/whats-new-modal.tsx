import { DotAnimation } from '@components/dots-animation';
import { Button, Center, Group, Stack, Text } from '@mantine/core';
import { ModalSettings } from '@mantine/modals/lib/context';
import { APP_RELEASES_URL } from '@models/app-urls';
import { isVersionGreater } from '@utils/compare-versions';
import { setDataTestId } from '@utils/test-id';
import { useEffect, useMemo, useState } from 'react';

import { ReleaseDetail } from './release-detail';
import { GitHubReleaseData } from './types';
import { useReleases } from './use-releases';
import { VersionList } from './version-list';

export const WHATS_NEW_MODAL_OPTIONS: ModalSettings = {
  size: 900,
  styles: { body: { paddingBottom: 0 }, header: { paddingInlineEnd: 16 } },
};

interface WhatsNewModalProps {
  onClose: () => void;
  lastSeenVersion?: string | null;
}

export const WhatsNewModal = ({ onClose, lastSeenVersion = null }: WhatsNewModalProps) => {
  const { releases, isLoading, error } = useReleases();
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);

  // Auto-select first unread version, or latest release
  useEffect(() => {
    if (releases.length === 0) return;

    if (lastSeenVersion) {
      const firstUnread = releases.find((r) => isVersionGreater(r.tag_name, lastSeenVersion));
      if (firstUnread) {
        setSelectedVersion(firstUnread.tag_name);
        return;
      }
    }

    setSelectedVersion(releases[0].tag_name);
  }, [releases, lastSeenVersion]);

  const selectedRelease = useMemo<GitHubReleaseData | null>(
    () => releases.find((r) => r.tag_name === selectedVersion) ?? null,
    [releases, selectedVersion],
  );

  if (error) {
    return null;
  }

  return (
    <Stack gap={0} data-testid={setDataTestId('whats-new-modal')} className="relative">
      {isLoading && (
        <Center h={300}>
          <Text size="md" c="text-secondary">
            Loading <DotAnimation />
          </Text>
        </Center>
      )}

      {!isLoading && releases.length > 0 && (
        <div className="flex">
          <VersionList
            releases={releases}
            selectedVersion={selectedVersion}
            onSelect={setSelectedVersion}
            lastSeenVersion={lastSeenVersion}
          />
          <ReleaseDetail release={selectedRelease} isLoading={false} />
        </div>
      )}

      <Group
        justify="space-between"
        className="sticky bottom-0 bg-backgroundPrimary-light py-6 px-4 dark:bg-backgroundPrimary-dark"
      >
        {!isLoading && (
          <>
            <Button
              variant="subtle"
              component="a"
              href={APP_RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View all releases on GitHub (opens in new tab)"
              data-testid={setDataTestId('whats-new-modal-view-releases-button')}
            >
              View all releases
            </Button>
            <Button onClick={onClose} data-testid={setDataTestId('whats-new-modal-submit-button')}>
              Got it!
            </Button>
          </>
        )}
      </Group>
    </Stack>
  );
};
