import { Stack, Select, Text } from '@mantine/core';
import { ParquetCompression } from '@models/export-options';
import { setDataTestId } from '@utils/test-id';

interface ParquetOptionsProps {
  compression: ParquetCompression;
  setCompression: (value: ParquetCompression) => void;
}

const compressionOptions = [
  { label: 'Snappy (default)', value: 'snappy' },
  { label: 'Gzip', value: 'gzip' },
  { label: 'Zstd', value: 'zstd' },
  { label: 'Uncompressed', value: 'uncompressed' },
];

export function ParquetOptions({ compression, setCompression }: ParquetOptionsProps) {
  return (
    <Stack gap="md">
      <Text size="sm" c="text-secondary">
        Parquet files use DuckDB&apos;s native export for best performance.
      </Text>
      <Select
        label="Compression"
        value={compression}
        onChange={(value) => {
          if (value) {
            setCompression(value as ParquetCompression);
          }
        }}
        data={compressionOptions}
        data-testid={setDataTestId('export-parquet-compression')}
      />
    </Stack>
  );
}
