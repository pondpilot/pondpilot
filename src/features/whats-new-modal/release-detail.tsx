import { DotAnimation } from '@components/dots-animation';
import { Center, List, ScrollArea, Text, Title } from '@mantine/core';
import { setDataTestId } from '@utils/test-id';
import ReactMarkdown from 'react-markdown';

import { GitHubReleaseData } from './types';

interface ReleaseDetailProps {
  release: GitHubReleaseData | null;
  isLoading: boolean;
}

const stripFullChangelogLink = (body: string): string => {
  if (!body || typeof body !== 'string') {
    return '';
  }
  return body.replace(/\*\*Full Changelog\*\*:.*$/m, '').trim();
};

/* eslint-disable unused-imports/no-unused-vars */
export const ReleaseDetail = ({ release, isLoading }: ReleaseDetailProps) => {
  if (isLoading) {
    return (
      <Center h={300} className="flex-1">
        <Text size="md" c="text-secondary">
          Loading <DotAnimation />
        </Text>
      </Center>
    );
  }

  if (!release?.body) {
    return (
      <Center h={300} className="flex-1">
        <Text size="md" c="text-secondary">
          No release notes available.
        </Text>
      </Center>
    );
  }

  return (
    <div className="flex-1 min-w-0" data-testid={setDataTestId('whats-new-modal-content')}>
      <ScrollArea h={640} scrollHideDelay={500} type="hover" className="px-4">
        <ReactMarkdown
          components={{
            h1: ({ node, ...props }) => <Title className="py-2" order={1} {...props} />,
            h2: ({ node, ...props }) => <Title className="py-2" order={2} {...props} />,
            h3: ({ node, ...props }) => <Title className="py-2" order={3} {...props} />,
            h4: ({ node, ...props }) => <Title className="py-2" order={4} {...props} />,
            p: ({ node, ...props }) => <Text className="py-2" {...props} />,
            ul: ({ node, ...props }) => (
              <List
                className="py-2 list-disc list-inside"
                {...props}
                c="text-primary"
                maw={600}
                size="sm"
              />
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
          {stripFullChangelogLink(release.body)}
        </ReactMarkdown>
      </ScrollArea>
    </div>
  );
};
