/* eslint-disable unused-imports/no-unused-vars */
import { Text, Stack, Title, List, Button, Group } from '@mantine/core';
import { ContextModalProps } from '@mantine/modals';
import { setDataTestId } from '@utils/test-id';
import { API_GITHUB_URL } from 'app-urls';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';

export const WHATS_NEW_MODAL_OPTIONS = {
  modal: 'whatsNew',
  centered: true,
  size: 675,
  radius: 'md',
  withCloseButton: true,
  closeOnClickOutside: false,
  closeOnEscape: false,
  innerProps: {},
};

export const WhatsNewModal = ({ context, id }: ContextModalProps) => {
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
    <Stack gap={16} maw={660} data-testid={setDataTestId('whats-new-modal')}>
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
        </div>
      )}
      <Group justify="end" mt={60}>
        <Button
          onClick={() => context.closeModal(id)}
          color="background-accent"
          data-testid={setDataTestId('whats-new-modal-submit-button')}
        >
          Got it!
        </Button>
      </Group>
    </Stack>
  );
};
