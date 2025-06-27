import { Box, Text } from '@mantine/core';

export const ErrorStackView = ({ error }: { error: Error }) => {
  return (
    <Box bg="gray.0" p="md" style={{ borderRadius: '8px' }}>
      <details>
        <summary
          style={{
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text size="sm" fw={500} component="span">
            Error details:
          </Text>
          <Text size="sm" c="text-accent" component="span">
            Show/hide details
          </Text>
        </summary>
        <div className="mt-2">
          <pre className="bg-zinc-200 p-2 text-sm mt-xs">{error?.message}</pre>
          <pre className="bg-zinc-200 p-2 text-sm overflow-auto max-h-32">{error?.stack}</pre>
        </div>
      </details>
    </Box>
  );
};
