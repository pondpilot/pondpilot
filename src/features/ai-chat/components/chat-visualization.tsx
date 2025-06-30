import { showSuccess } from '@components/app-notifications';
import { createSQLScript } from '@controllers/sql-script';
import { getOrCreateTabFromScript } from '@controllers/tab';
import { Box, Text, Badge, Group, ActionIcon, Tooltip, Collapse, Code, Loader, Center } from '@mantine/core';
import { useDisclosure, useClipboard } from '@mantine/hooks';
import { ChatMessageQuery } from '@models/ai-chat';
import { IconCode, IconExternalLink, IconCopy, IconChevronUp } from '@tabler/icons-react';

import { ChatResultChart } from './chat-result-chart';

interface ChatVisualizationProps {
  query: ChatMessageQuery;
}

export const ChatVisualization = ({ query }: ChatVisualizationProps) => {
  const [showSql, { toggle: toggleSql }] = useDisclosure(false);
  const clipboard = useClipboard();

  // Show loading state while generating chart
  if (query.isGeneratingChart && query.results) {
    return (
      <Box className="bg-backgroundTertiary-light dark:bg-backgroundTertiary-dark rounded-lg p-3 border border-borderSecondary-light dark:border-borderSecondary-dark">
        <Group justify="space-between" className="mb-3">
          <Badge size="sm" variant="dot" color="violet">
            Visualization
          </Badge>
          <Text size="xs" c="dimmed">
            Generating chart...
          </Text>
        </Group>
        <Center h={200}>
          <Loader size="sm" color="violet" />
        </Center>
      </Box>
    );
  }

  if (!query.chartSpec || !query.results) {
    return null;
  }

  const handleCopyQuery = () => {
    clipboard.copy(query.sql);
    showSuccess({ title: 'Query copied to clipboard', message: '' });
  };

  const handleOpenInScript = () => {
    const script = createSQLScript(
      `Chart Query - ${new Date().toLocaleString()}`,
      query.sql,
    );
    getOrCreateTabFromScript(script, true);
    showSuccess({ title: 'Query opened in new script tab', message: '' });
  };

  return (
    <Box className="space-y-2">
      {/* Chart Container */}
      <Box className="bg-backgroundTertiary-light dark:bg-backgroundTertiary-dark rounded-lg p-3 border border-borderSecondary-light dark:border-borderSecondary-dark">
        <Group justify="space-between" className="mb-3">
          <Group gap="xs">
            <Badge size="sm" variant="dot" color="violet">
              Visualization
            </Badge>
            {query.executionTime && (
              <Text size="xs" c="dimmed">
                {query.results.rows.length} data points • {query.executionTime}ms
              </Text>
            )}
          </Group>
          <Group gap={4}>
            <Tooltip label={showSql ? 'Hide SQL' : 'Show SQL'}>
              <ActionIcon
                size="sm"
                variant="subtle"
                onClick={toggleSql}
                className="hover:bg-transparent016-light dark:hover:bg-transparent016-dark"
              >
                {showSql ? <IconChevronUp size={14} /> : <IconCode size={14} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Copy SQL">
              <ActionIcon
                size="sm"
                variant="subtle"
                onClick={handleCopyQuery}
                className="hover:bg-transparent016-light dark:hover:bg-transparent016-dark"
              >
                <IconCopy size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Open in new script tab">
              <ActionIcon
                size="sm"
                variant="subtle"
                onClick={handleOpenInScript}
                className="hover:bg-transparent016-light dark:hover:bg-transparent016-dark"
              >
                <IconExternalLink size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {/* Chart */}
        <ChatResultChart results={query.results} spec={query.chartSpec} />

        {/* Collapsible SQL */}
        <Collapse in={showSql}>
          <Box className="mt-3 pt-3 border-t border-borderPrimary-light dark:border-borderPrimary-dark">
            <Text size="xs" c="dimmed" className="mb-2">
              SQL Query:
            </Text>
            <Code block className="language-sql text-xs bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark border border-borderPrimary-light dark:border-borderPrimary-dark">
              {query.sql}
            </Code>
          </Box>
        </Collapse>
      </Box>
    </Box>
  );
};
