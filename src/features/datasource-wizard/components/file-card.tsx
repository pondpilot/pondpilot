import { Stack, Text, UnstyledButton } from '@mantine/core';
import { IconFilePlus } from '@tabler/icons-react';

interface FileCardProps {
  onClose: () => void;
  handleAddFile: () => Promise<void>;
}

export function FileCard({ onClose, handleAddFile }: FileCardProps) {
  const handleClick = async () => {
    await handleAddFile();
    onClose();
  };

  return (
    <UnstyledButton
      onClick={handleClick}
      className="flex flex-col items-center justify-center p-6 rounded-lg border border-borderPrimary-light dark:border-borderPrimary-dark hover:border-borderAccent-light dark:hover:border-borderAccent-dark hover:bg-transparentBrandBlue-012 dark:hover:bg-transparent004-dark transition-all duration-200 cursor-pointer h-40"
    >
      <Stack align="center" gap={12}>
        <IconFilePlus
          size={48}
          className="text-textSecondary-light dark:text-textSecondary-dark"
          stroke={1.5}
        />
        <Stack gap={4} align="center">
          <Text fw={500} size="sm" c="text-primary">
            Add Files
          </Text>
          <Text size="xs" c="text-secondary" ta="center">
            CSV, Parquet, JSON, Excel
          </Text>
        </Stack>
      </Stack>
    </UnstyledButton>
  );
}
