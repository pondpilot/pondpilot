/* eslint-disable unused-imports/no-unused-vars */
import { showError } from '@components/app-notifications';
import { DotAnimation } from '@components/dots-animation';
import { Text, Stack, Title, List, Button, Group, ScrollArea, Center } from '@mantine/core';
import { ModalSettings } from '@mantine/modals/lib/context';
import { APP_RELEASE_TAGS_GITHUB_API_URL } from '@models/app-urls';
import { setDataTestId } from '@utils/test-id';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';

import { normalizeChangelogLinks } from './utils';

export const WHATS_NEW_MODAL_OPTIONS: ModalSettings = {
  size: 675,
  styles: { body: { paddingBottom: 0 }, header: { paddingInlineEnd: 16 } },
};

export const WhatsNewModal = ({ onClose }: { onClose: () => void }) => {
  const [ghReleaseNotesData, setGhReleaseNotesData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchGhReleaseNotesData = async () => {
      try {
        const response = await fetch(`${APP_RELEASE_TAGS_GITHUB_API_URL}/${__VERSION__}`);

        const data = await response.json();
        if (!response.ok) {
          throw new Error(`Error fetching release notes: ${data.message}`);
        }

        setGhReleaseNotesData(data);
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        showError({
          title: 'Error fetching release notes',
          message,
          autoClose: 5000,
        });
        onClose();
      } finally {
        setIsLoading(false);
      }
    };

    fetchGhReleaseNotesData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Stack gap={16} maw={660} data-testid={setDataTestId('whats-new-modal')} className="relative">
      {isLoading && (
        <Center h={300}>
          <Text size="md" c="text-secondary">
            Loading <DotAnimation />
          </Text>
        </Center>
      )}

      {ghReleaseNotesData?.body && (
        <div data-testid={setDataTestId('whats-new-modal-content')}>
          <ScrollArea h={600} scrollHideDelay={500} type="hover">
            <ReactMarkdown
              components={{
                // TODO: Add more components and styles if needed
                h1: ({ node, ...props }) => <Title className="py-2" order={1} {...props} />,
                h2: ({ node, ...props }) => <Title className="py-2" order={2} {...props} />,
                h3: ({ node, ...props }) => <Title className="py-2" order={3} {...props} />,
                h4: ({ node, ...props }) => <Title className="py-2" order={4} {...props} />,
                p: ({ node, ...props }) => <Text className="py-2" {...props} />,
                ul: ({ node, ...props }) => (
                  <List className="py-2 list-disc list-inside" {...props} maw={600} size="sm" />
                ),
                li: ({ node, ...props }) => <List.Item {...props} />,
                a: ({ node, ...props }) => (
                  <Text
                    component="a"
                    {...props}
                    c="text-accent"
                    target="_blank"
                    className="underline py-2"
                  />
                ),
              }}
            >
              {normalizeChangelogLinks(ghReleaseNotesData.body)}
            </ReactMarkdown>
          </ScrollArea>
        </div>
      )}
      <Group justify="end" className="sticky bottom-0 bg-backgroundPrimary-light py-6 px-4">
        {!isLoading && (
          <Button
            onClick={onClose}
            color="background-accent"
            data-testid={setDataTestId('whats-new-modal-submit-button')}
          >
            Got it!
          </Button>
        )}
      </Group>
    </Stack>
  );
};
