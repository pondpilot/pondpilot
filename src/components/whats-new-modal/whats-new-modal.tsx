/* eslint-disable unused-imports/no-unused-vars */
import { Text, Stack, Title, List, Button, Group } from '@mantine/core';
import { ModalSettings } from '@mantine/modals/lib/context';
import { setDataTestId } from '@utils/test-id';
import { API_GITHUB_URL } from 'app-urls';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';

export const WHATS_NEW_MODAL_OPTIONS: ModalSettings = {
  size: 675,
  styles: { body: { paddingBottom: 0 } },
};

export const WhatsNewModal = ({ onClose }: { onClose: () => void }) => {
  const [ghReleaseNotesData, setGhReleaseNotesData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const fetchGhReleaseNotesData = async () => {
      try {
        const response = await fetch(`${API_GITHUB_URL}/${__VERSION__}`);
        const data = await response.json();
        setGhReleaseNotesData(data);
      } catch (error) {
        console.error('Error fetching release notes:', error);
        setIsError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGhReleaseNotesData();
  }, []);

  return (
    <Stack gap={16} maw={660} data-testid={setDataTestId('whats-new-modal')} className="relative">
      {isLoading && (
        <Text c="text-secondary" className="text-base">
          Loading release notes...
        </Text>
      )}
      {isError && (
        <Text c="text-error" className="text-base">
          Error loading release notes. Please try again later.
        </Text>
      )}
      {ghReleaseNotesData && (
        <div data-testid={setDataTestId('whats-new-modal-content')}>
          <Stack>
            <ReactMarkdown
              components={{
                // TODO: Add more components and styles
                h1: ({ node, ...props }) => <Title order={1} {...props} />,
                h2: ({ node, ...props }) => <Title order={2} {...props} />,
                h3: ({ node, ...props }) => <Title order={3} {...props} />,
                h4: ({ node, ...props }) => <Title order={4} {...props} />,
                p: ({ node, ...props }) => <Text {...props} />,
                ul: ({ node, ...props }) => <List {...props} className="" maw={660} size="sm" />,
                li: ({ node, ...props }) => <List.Item {...props} />,
                a: ({ node, ...props }) => (
                  <Text
                    component="a"
                    {...props}
                    c="text-accent"
                    target="_blank"
                    className="underline"
                  />
                ),
              }}
            >
              {ghReleaseNotesData.body}
            </ReactMarkdown>
          </Stack>
        </div>
      )}
      <Group justify="end" className="sticky bottom-0 bg-backgroundPrimary-light py-8 px-4">
        <Button
          onClick={onClose}
          color="background-accent"
          data-testid={setDataTestId('whats-new-modal-submit-button')}
        >
          Got it!
        </Button>
      </Group>
    </Stack>
  );
};
