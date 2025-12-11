import { Center, Loader, Stack, Text } from '@mantine/core';

interface ChartLoadingProps {
  message?: string;
  size?: 'sm' | 'md';
}

/**
 * Shared loading component for chart views.
 * Provides consistent loading state UI across all chart components.
 */
export function ChartLoading({ message = 'Loading chart...', size = 'md' }: ChartLoadingProps) {
  const textSize = size === 'sm' ? 'xs' : 'sm';

  return (
    <Center className="h-full">
      <Stack align="center" gap="xs">
        <Loader size={size} />
        <Text size={textSize} c="dimmed">
          {message}
        </Text>
      </Stack>
    </Center>
  );
}
