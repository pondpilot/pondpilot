import duckLogoDark from '@assets/duck-dark.svg';
import duckLogo from '@assets/duck.svg';
import { useAppTheme } from '@hooks/use-app-theme';
import { Loader, Stack, Text } from '@mantine/core';

export const ComparisonExecutionProgress = () => {
  const colorScheme = useAppTheme();
  const logoSrc = colorScheme === 'dark' ? duckLogoDark : duckLogo;

  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex items-center justify-center">
        <img
          src={logoSrc}
          alt="Polly the pond pilot"
          className="h-24 w-24 animate-bounce drop-shadow-lg"
        />
      </div>

      <Stack gap="xs" align="center" w="100%" maw={520}>
        <Text fw={600} size="lg" c="text-primary">
          Polly is comparing your data…
        </Text>
        <Text size="sm" c="text-secondary">
          Large datasets can take a little longer to crunch. Keep this tab open and we&apos;ll bring
          the results in as soon as they&apos;re ready.
        </Text>
      </Stack>

      <Loader size="lg" variant="dots" color="accent" />
    </div>
  );
};
