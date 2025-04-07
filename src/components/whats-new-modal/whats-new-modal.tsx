import { Text, Stack, Title, List } from '@mantine/core';
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

export const WhatsNewModal = () => {
  const [ghReleaseNotesData, setGhReleaseNotesData] = useState<any>(null);

  useEffect(() => {
    const fetchGhReleaseNotesData = async () => {
      const response = await fetch(
        `https://api.github.com/repos/pondpilot/pondpilot/releases/tags/${__VERSION__}`,
      );
      const data = await response.json();
      setGhReleaseNotesData(data);
    };

    fetchGhReleaseNotesData();
  }, []);

  return (
    <Stack gap={16} maw={660}>
      {ghReleaseNotesData && (
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
      )}
    </Stack>
  );
};
