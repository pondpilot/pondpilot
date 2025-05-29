import { showError } from '@components/app-notifications';
import { ExportResult } from '@features/tab-view/hooks/use-table-export';
import {
  Modal,
  Button,
  Stack,
  TextInput,
  Checkbox,
  Group,
  Text,
  Box,
  Title,
  ActionIcon,
  Alert,
  UnstyledButton,
  Divider,
  Radio,
} from '@mantine/core';
import { DataAdapterApi } from '@models/data-adapter';
import {
  BaseExportOptions,
  DelimitedTextExportOptions,
  ExportFormat,
  MarkdownExportOptions,
  SqlExportOptions,
  XlsxExportOptions,
  XmlExportOptions,
} from '@models/export-options';
import { IconX, IconAlertTriangle, IconDownload } from '@tabler/icons-react';
import { sanitizeFileName } from '@utils/export-data';
import { setDataTestId } from '@utils/test-id';
import { cn } from '@utils/ui/styles';
import { useState, useRef, useEffect } from 'react';

interface ExportOptionsModalProps {
  opened: boolean;
  onClose: () => void;
  onExport: (
    format: ExportFormat,
    options: BaseExportOptions,
    customFileName?: string,
  ) => Promise<ExportResult>;
  filename: string;
  dataAdapter?: DataAdapterApi;
}

const formatOptions = [
  { label: 'CSV', value: 'csv' },
  { label: 'TSV', value: 'tsv' },
  { label: 'Excel', value: 'xlsx' },
  { label: 'SQL', value: 'sql' },
  { label: 'XML', value: 'xml' },
  { label: 'Markdown', value: 'md' },
];

export function ExportOptionsModal({
  opened,
  onClose,
  onExport,
  filename,
  dataAdapter,
}: ExportOptionsModalProps) {
  const [format, setFormat] = useState<ExportFormat>('csv');
  const inputRef = useRef<HTMLInputElement>(null);

  const [includeHeader, setIncludeHeader] = useState(true);

  // Filename handling
  const sanitizedInput = sanitizeFileName(filename) || 'export';
  const defaultExtension = format === 'xlsx' ? 'xlsx' : format;
  const initialBaseName = (() => {
    const idx = sanitizedInput.lastIndexOf('.');
    if (idx > 0) {
      const namePart = sanitizedInput.substring(0, idx);
      return namePart || 'export';
    }
    return sanitizedInput;
  })();
  const [exportFilename, setExportFilename] = useState(`${initialBaseName}.${defaultExtension}`);
  const [filenameError, setFilenameError] = useState('');

  // Update filename when format changes but preserve user edits to the basename
  const updateFilenameOnFormatChange = (newFormat: ExportFormat) => {
    const idx = exportFilename.lastIndexOf('.');
    const currentBaseName = idx > 0 ? exportFilename.substring(0, idx) : exportFilename;
    const newExt = newFormat === 'xlsx' ? 'xlsx' : newFormat;
    setExportFilename(`${currentBaseName}.${newExt}`);
  };

  // CSV/TSV options
  const [delimiter, setDelimiter] = useState(',');
  const [delimiterError, setDelimiterError] = useState('');
  const [quoteChar, setQuoteChar] = useState('"');
  const [quoteCharError, setQuoteCharError] = useState('');
  const [escapeChar, setEscapeChar] = useState('"');
  const [escapeCharError, setEscapeCharError] = useState('');

  // XLSX options
  const [sheetName, setSheetName] = useState('Sheet1');
  const [sheetNameError, setSheetNameError] = useState('');

  // SQL options
  const [tableName, setTableName] = useState('exported_table');
  const [tableNameError, setTableNameError] = useState('');
  const [includeCreateTable, setIncludeCreateTable] = useState(true);
  const [includeDataTypes, setIncludeDataTypes] = useState(true);

  // XML options
  const [rootElement, setRootElement] = useState('data');
  const [rootElementError, setRootElementError] = useState('');
  const [rowElement, setRowElement] = useState('row');
  const [rowElementError, setRowElementError] = useState('');

  // Markdown options
  const [mdFormat, setMdFormat] = useState<'github' | 'standard'>('github');
  const [alignColumns, setAlignColumns] = useState(true);

  // Focus filename input when modal opens
  useEffect(() => {
    if (opened && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [opened]);

  // Data size warning state
  const [largeDatasetSize, setLargeDatasetSize] = useState(0);
  const [isLargeDataset, setIsLargeDataset] = useState(false);

  const validateInputs = (): boolean => {
    let isValid = true;

    // Validate filename
    if (!exportFilename.trim()) {
      setFilenameError('Filename is required');
      isValid = false;
    } else if (!/\.\w+$/.test(exportFilename)) {
      setFilenameError('Filename must include an extension');
      isValid = false;
    } else {
      setFilenameError('');
    }

    // Format-specific validations
    switch (format) {
      case 'csv': {
        if (!delimiter) {
          setDelimiterError('Delimiter is required');
          isValid = false;
        } else {
          setDelimiterError('');
        }
        if (!quoteChar) {
          setQuoteCharError('Quote character is required');
          isValid = false;
        } else {
          setQuoteCharError('');
        }
        if (!escapeChar) {
          setEscapeCharError('Escape character is required');
          isValid = false;
        } else {
          setEscapeCharError('');
        }
        break;
      }
      case 'tsv': {
        // TSV uses fixed tab delimiter; clear any delimiter errors
        setDelimiterError('');
        if (!quoteChar) {
          setQuoteCharError('Quote character is required');
          isValid = false;
        } else {
          setQuoteCharError('');
        }
        if (!escapeChar) {
          setEscapeCharError('Escape character is required');
          isValid = false;
        } else {
          setEscapeCharError('');
        }
        break;
      }

      case 'xlsx':
        if (!sheetName.trim()) {
          setSheetNameError('Sheet name is required');
          isValid = false;
        } else {
          setSheetNameError('');
        }
        break;

      case 'sql':
        if (!tableName.trim()) {
          setTableNameError('Table name is required');
          isValid = false;
        } else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
          setTableNameError(
            'Invalid table name. Use only letters, numbers, and underscores. Must start with a letter or underscore.',
          );
          isValid = false;
        } else {
          setTableNameError('');
        }
        break;

      case 'xml':
        if (!rootElement.trim()) {
          setRootElementError('Root element name is required');
          isValid = false;
        } else if (!/^[a-zA-Z_][a-zA-Z0-9_\-.]*$/.test(rootElement)) {
          setRootElementError('Invalid XML element name');
          isValid = false;
        } else {
          setRootElementError('');
        }

        if (!rowElement.trim()) {
          setRowElementError('Row element name is required');
          isValid = false;
        } else if (!/^[a-zA-Z_][a-zA-Z0-9_\-.]*$/.test(rowElement)) {
          setRowElementError('Invalid XML element name');
          isValid = false;
        } else {
          setRowElementError('');
        }
        break;
    }

    return isValid;
  };

  // Check dataset size when modal opens
  useEffect(() => {
    if (opened) {
      try {
        const LARGE_DATASET_THRESHOLD = 100000;

        const estimatedRowCount =
          dataAdapter?.rowCountInfo?.estimatedRowCount ||
          dataAdapter?.rowCountInfo?.realRowCount ||
          dataAdapter?.rowCountInfo?.availableRowCount ||
          0;

        if (estimatedRowCount > LARGE_DATASET_THRESHOLD) {
          setLargeDatasetSize(estimatedRowCount);
          setIsLargeDataset(true);
        } else {
          setIsLargeDataset(false);
        }
      } catch (error) {
        setIsLargeDataset(false);
        console.warn('Could not determine dataset size');
      }
    }
  }, [opened, dataAdapter]);

  const handleExport = async () => {
    if (!validateInputs()) {
      return;
    }

    // Dismiss modal immediately as export progress will be shown in notifications
    onClose();
    performExport();
  };

  const performExport = async () => {
    try {
      const baseOptions: BaseExportOptions = { includeHeader };
      let _result;

      switch (format) {
        case 'csv':
        case 'tsv': {
          const csvOptions: DelimitedTextExportOptions = {
            includeHeader,
            delimiter: format === 'csv' ? delimiter : '\t',
            quoteChar,
            escapeChar,
          };
          _result = await onExport(format, csvOptions, exportFilename);
          break;
        }
        case 'xlsx': {
          const xlsxOptions: XlsxExportOptions = {
            includeHeader,
            sheetName,
          };
          _result = await onExport(format, xlsxOptions, exportFilename);
          break;
        }
        case 'sql': {
          const sqlOptions: SqlExportOptions = {
            includeHeader,
            tableName,
            includeCreateTable,
            includeDataTypes,
          };
          _result = await onExport(format, sqlOptions, exportFilename);
          break;
        }
        case 'xml': {
          const xmlOptions: XmlExportOptions = {
            includeHeader,
            rootElement,
            rowElement,
          };
          _result = await onExport(format, xmlOptions, exportFilename);
          break;
        }
        case 'md': {
          const mdOptions: MarkdownExportOptions = {
            includeHeader,
            format: mdFormat,
            alignColumns,
          };
          _result = await onExport(format, mdOptions, exportFilename);
          break;
        }
        default:
          _result = await onExport(format, baseOptions, exportFilename);
          break;
      }
    } catch (error) {
      showError({
        title: 'Export failed',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        autoClose: 5000,
      });
    }
  };

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        withCloseButton={false}
        padding={0}
        size="lg"
        radius="lg"
        data-testid={setDataTestId('export-options-modal')}
        classNames={{
          content: 'bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark',
        }}
      >
        <Stack gap={0}>
          <Group justify="space-between" p="xl" pb="md">
            <Group gap="xs">
              <IconDownload size={20} stroke={1.5} />
              <Title order={3} size="h4">
                Export Data
              </Title>
            </Group>
            <ActionIcon size="md" onClick={onClose} variant="subtle" color="gray" radius="md">
              <IconX size={18} />
            </ActionIcon>
          </Group>

          <Box px="xl" pb="xl">
            <TextInput
              ref={inputRef}
              label="File Name"
              value={exportFilename}
              onChange={(e) => setExportFilename(e.currentTarget.value)}
              data-testid={setDataTestId('export-filename')}
              error={filenameError}
              size="md"
              mb="lg"
              classNames={{
                root: 'w-full',
                label: 'mb-2 text-sm font-medium text-textPrimary-light dark:text-textPrimary-dark',
                input:
                  'border-borderPrimary-light dark:border-borderPrimary-dark rounded-lg h-10 px-3 placeholder-textTertiary-light dark:placeholder-textTertiary-dark focus:border-borderAccent-light dark:focus:border-borderAccent-dark',
              }}
            />

            <Text size="sm" c="dimmed" mb="lg">
              Choose a format and configure options to export your data.
            </Text>

            <Group align="stretch" gap="lg" wrap="nowrap">
              {/* Format selector - vertical on the left */}
              <Stack gap={4} w={140}>
                {formatOptions.map((option) => (
                  <UnstyledButton
                    key={option.value}
                    onClick={() => {
                      const newFormat = option.value as ExportFormat;
                      setFormat(newFormat);
                      updateFilenameOnFormatChange(newFormat);
                    }}
                    className={cn(
                      'px-4 py-2.5 rounded-full transition-colors text-sm font-medium text-left',
                      format === option.value
                        ? 'bg-transparentBrandBlue-016 dark:bg-transparentBrandBlue-016 text-textPrimary-light dark:text-textPrimary-dark'
                        : 'hover:bg-transparent004 hover:dark:bg-transparent004 text-textSecondary-light dark:text-textSecondary-dark',
                    )}
                    data-testid={setDataTestId(`export-format-${option.value}`)}
                  >
                    {option.label}
                  </UnstyledButton>
                ))}
              </Stack>

              <Divider orientation="vertical" />

              {/* Format-specific settings on the right */}
              <Box style={{ flex: 1, minHeight: '300px' }}>
                {format === 'csv' && (
                  <Stack gap="md">
                    <Checkbox
                      label="Include header row"
                      checked={includeHeader}
                      onChange={(e) => setIncludeHeader(e.currentTarget.checked)}
                      data-testid={setDataTestId('export-include-header')}
                      color="background-accent"
                      classNames={{
                        root: 'flex items-center',
                        label: 'text-sm text-textPrimary-light dark:text-textPrimary-dark',
                      }}
                    />
                    <TextInput
                      label="Delimiter"
                      value={delimiter}
                      onChange={(e) => setDelimiter(e.currentTarget.value)}
                      data-testid={setDataTestId('export-csv-delimiter')}
                      error={delimiterError}
                      size="md"
                      classNames={{
                        root: 'w-full',
                        label:
                          'mb-2 text-sm font-medium text-textPrimary-light dark:text-textPrimary-dark',
                        input:
                          'border-borderPrimary-light dark:border-borderPrimary-dark rounded-lg h-10 px-3',
                      }}
                    />
                    <TextInput
                      label="Quote Character"
                      value={quoteChar}
                      onChange={(e) => setQuoteChar(e.currentTarget.value)}
                      error={quoteCharError}
                      size="md"
                      classNames={{
                        root: 'w-full',
                        label:
                          'mb-2 text-sm font-medium text-textPrimary-light dark:text-textPrimary-dark',
                        input:
                          'border-borderPrimary-light dark:border-borderPrimary-dark rounded-lg h-10 px-3',
                      }}
                    />
                    <TextInput
                      label="Escape Character"
                      value={escapeChar}
                      onChange={(e) => setEscapeChar(e.currentTarget.value)}
                      error={escapeCharError}
                      size="md"
                      classNames={{
                        root: 'w-full',
                        label:
                          'mb-2 text-sm font-medium text-textPrimary-light dark:text-textPrimary-dark',
                        input:
                          'border-borderPrimary-light dark:border-borderPrimary-dark rounded-lg h-10 px-3',
                      }}
                    />
                  </Stack>
                )}

                {format === 'tsv' && (
                  <Stack gap="md">
                    <Checkbox
                      label="Include header row"
                      checked={includeHeader}
                      onChange={(e) => setIncludeHeader(e.currentTarget.checked)}
                      data-testid={setDataTestId('export-include-header')}
                      color="background-accent"
                      classNames={{
                        root: 'flex items-center',
                        label: 'text-sm text-textPrimary-light dark:text-textPrimary-dark',
                      }}
                    />
                    <TextInput
                      label="Quote Character"
                      value={quoteChar}
                      onChange={(e) => setQuoteChar(e.currentTarget.value)}
                      error={quoteCharError}
                      size="md"
                      classNames={{
                        root: 'w-full',
                        label:
                          'mb-2 text-sm font-medium text-textPrimary-light dark:text-textPrimary-dark',
                        input:
                          'border-borderPrimary-light dark:border-borderPrimary-dark rounded-lg h-10 px-3',
                      }}
                    />
                    <TextInput
                      label="Escape Character"
                      value={escapeChar}
                      onChange={(e) => setEscapeChar(e.currentTarget.value)}
                      error={escapeCharError}
                      size="md"
                      classNames={{
                        root: 'w-full',
                        label:
                          'mb-2 text-sm font-medium text-textPrimary-light dark:text-textPrimary-dark',
                        input:
                          'border-borderPrimary-light dark:border-borderPrimary-dark rounded-lg h-10 px-3',
                      }}
                    />
                  </Stack>
                )}

                {format === 'xlsx' && (
                  <Stack gap="md">
                    <Checkbox
                      label="Include header row"
                      checked={includeHeader}
                      onChange={(e) => setIncludeHeader(e.currentTarget.checked)}
                      data-testid={setDataTestId('export-include-header')}
                      color="background-accent"
                      classNames={{
                        root: 'flex items-center',
                        label: 'text-sm text-textPrimary-light dark:text-textPrimary-dark',
                      }}
                    />
                    <TextInput
                      label="Sheet Name"
                      value={sheetName}
                      onChange={(e) => setSheetName(e.currentTarget.value)}
                      data-testid={setDataTestId('export-xlsx-sheet-name')}
                      error={sheetNameError}
                      size="md"
                      classNames={{
                        root: 'w-full',
                        label:
                          'mb-2 text-sm font-medium text-textPrimary-light dark:text-textPrimary-dark',
                        input:
                          'border-borderPrimary-light dark:border-borderPrimary-dark rounded-lg h-10 px-3',
                      }}
                    />
                  </Stack>
                )}

                {format === 'sql' && (
                  <Stack gap="md">
                    <TextInput
                      label="Table Name"
                      value={tableName}
                      onChange={(e) => setTableName(e.currentTarget.value)}
                      data-testid={setDataTestId('export-sql-table-name')}
                      error={tableNameError}
                      size="md"
                      classNames={{
                        root: 'w-full',
                        label:
                          'mb-2 text-sm font-medium text-textPrimary-light dark:text-textPrimary-dark',
                        input:
                          'border-borderPrimary-light dark:border-borderPrimary-dark rounded-lg h-10 px-3',
                      }}
                    />
                    <Checkbox
                      label="Include CREATE TABLE statement"
                      checked={includeCreateTable}
                      onChange={(e) => setIncludeCreateTable(e.currentTarget.checked)}
                      color="background-accent"
                      classNames={{
                        root: 'flex items-center',
                        label: 'text-sm text-textPrimary-light dark:text-textPrimary-dark',
                      }}
                    />
                    <Checkbox
                      label="Include column data types"
                      checked={includeDataTypes}
                      onChange={(e) => setIncludeDataTypes(e.currentTarget.checked)}
                      disabled={!includeCreateTable}
                      color="background-accent"
                      classNames={{
                        root: 'flex items-center',
                        label: 'text-sm text-textPrimary-light dark:text-textPrimary-dark',
                      }}
                    />
                  </Stack>
                )}

                {format === 'xml' && (
                  <Stack gap="md">
                    <Checkbox
                      label="Include header row"
                      checked={includeHeader}
                      onChange={(e) => setIncludeHeader(e.currentTarget.checked)}
                      data-testid={setDataTestId('export-include-header')}
                      color="background-accent"
                      classNames={{
                        root: 'flex items-center',
                        label: 'text-sm text-textPrimary-light dark:text-textPrimary-dark',
                      }}
                    />
                    <TextInput
                      label="Root Element Name"
                      value={rootElement}
                      onChange={(e) => setRootElement(e.currentTarget.value)}
                      data-testid={setDataTestId('export-xml-root')}
                      error={rootElementError}
                      size="md"
                      classNames={{
                        root: 'w-full',
                        label:
                          'mb-2 text-sm font-medium text-textPrimary-light dark:text-textPrimary-dark',
                        input:
                          'border-borderPrimary-light dark:border-borderPrimary-dark rounded-lg h-10 px-3',
                      }}
                    />
                    <TextInput
                      label="Row Element Name"
                      value={rowElement}
                      onChange={(e) => setRowElement(e.currentTarget.value)}
                      data-testid={setDataTestId('export-xml-row')}
                      error={rowElementError}
                      size="md"
                      classNames={{
                        root: 'w-full',
                        label:
                          'mb-2 text-sm font-medium text-textPrimary-light dark:text-textPrimary-dark',
                        input:
                          'border-borderPrimary-light dark:border-borderPrimary-dark rounded-lg h-10 px-3',
                      }}
                    />
                  </Stack>
                )}

                {format === 'md' && (
                  <Stack gap="md">
                    <Checkbox
                      label="Include header row"
                      checked={includeHeader}
                      onChange={(e) => setIncludeHeader(e.currentTarget.checked)}
                      data-testid={setDataTestId('export-include-header')}
                      color="background-accent"
                      classNames={{
                        root: 'flex items-center',
                        label: 'text-sm text-textPrimary-light dark:text-textPrimary-dark',
                      }}
                    />
                    <Box>
                      <Text size="sm" fw={500} mb="xs">
                        Markdown Format
                      </Text>
                      <Text size="xs" c="dimmed" mb="sm">
                        Use GitHub for best compatibility with GitHub and similar platforms; choose
                        Standard for widest compatibility.
                      </Text>
                      <Radio.Group
                        value={mdFormat}
                        onChange={(value) => setMdFormat(value as 'github' | 'standard')}
                      >
                        <Group gap="xl">
                          <Radio
                            value="github"
                            label="GitHub"
                            color="background-accent"
                            classNames={{
                              root: 'flex items-center',
                              label:
                                'text-sm text-textPrimary-light dark:text-textPrimary-dark ml-2',
                            }}
                          />
                          <Radio
                            value="standard"
                            label="Standard"
                            color="background-accent"
                            classNames={{
                              root: 'flex items-center',
                              label:
                                'text-sm text-textPrimary-light dark:text-textPrimary-dark ml-2',
                            }}
                          />
                        </Group>
                      </Radio.Group>
                    </Box>
                    <Checkbox
                      label="Align columns"
                      checked={alignColumns}
                      onChange={(e) => setAlignColumns(e.currentTarget.checked)}
                      color="background-accent"
                      classNames={{
                        root: 'flex items-center',
                        label: 'text-sm text-textPrimary-light dark:text-textPrimary-dark',
                      }}
                    />
                  </Stack>
                )}
              </Box>
            </Group>

            {isLargeDataset && (
              <Alert
                icon={<IconAlertTriangle size={16} />}
                color="yellow"
                mt="lg"
                classNames={{
                  root: 'rounded-lg',
                }}
              >
                Large dataset ({largeDatasetSize.toLocaleString()} rows). Export may be slow.
              </Alert>
            )}
          </Box>

          <Box
            px="xl"
            py="lg"
            style={{ borderTop: '1px solid var(--mantine-color-borderPrimary-light)' }}
          >
            <Group justify="flex-end" gap="sm">
              <Button
                variant="subtle"
                onClick={onClose}
                size="md"
                radius="lg"
                color="gray"
                data-testid={setDataTestId('export-cancel')}
              >
                Cancel
              </Button>
              <Button
                onClick={handleExport}
                data-testid={setDataTestId('export-confirm')}
                size="md"
                radius="lg"
                className="bg-backgroundAccent-light dark:bg-backgroundAccent-dark hover:bg-backgroundAccent-light hover:dark:bg-backgroundAccent-dark"
                styles={{
                  root: {
                    '&:hover': {
                      backgroundColor: 'var(--mantine-color-backgroundAccent)',
                    },
                  },
                }}
              >
                {isLargeDataset ? 'Export Anyway' : 'Export'}
              </Button>
            </Group>
          </Box>
        </Stack>
      </Modal>
    </>
  );
}
