import { showError } from '@components/app-notifications';
import { ExportResult } from '@features/tab-view/hooks/use-table-export';
import {
  Modal,
  Button,
  Stack,
  TextInput,
  Checkbox,
  Group,
  Select,
  Tabs,
  Text,
  Box,
  Title,
  ActionIcon,
  Alert,
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
import { IconX, IconAlertTriangle } from '@tabler/icons-react';
import { sanitizeFileName } from '@utils/export-data';
import { setDataTestId } from '@utils/test-id';
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
            delimiter: format === 'csv' ? ',' : '\t',
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
        size="md"
        radius="md"
        data-testid={setDataTestId('export-options-modal')}
        classNames={{
          content: 'bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark',
        }}
      >
        <Stack p="md" gap={20}>
          <Group justify="space-between">
            <Title order={4}>Export Data</Title>
            <ActionIcon size={20} onClick={onClose}>
              <IconX />
            </ActionIcon>
          </Group>

          <Text>Choose a format and configure options to export your data.</Text>

          <TextInput
            ref={inputRef}
            label="Filename"
            value={exportFilename}
            onChange={(e) => setExportFilename(e.currentTarget.value)}
            data-testid={setDataTestId('export-filename')}
            error={filenameError}
            size="sm"
            classNames={{
              input:
                'border-borderPrimary-light dark:border-borderPrimary-dark rounded-md text-sm leading-none px-4 py-2 placeholder-textTertiary-light dark:placeholder-textTertiary-dark focus:border-borderAccent-light dark:focus:border-borderAccent-dark',
            }}
          />

          <Select
            label="Export format"
            data={formatOptions}
            value={format}
            onChange={(value) => {
              const newFormat = value as ExportFormat;
              setFormat(newFormat);
              updateFilenameOnFormatChange(newFormat);
            }}
            data-testid={setDataTestId('export-format-selector')}
            size="sm"
            classNames={{
              input:
                'border-borderPrimary-light dark:border-borderPrimary-dark rounded-md text-sm leading-none px-4 py-2 placeholder-textTertiary-light dark:placeholder-textTertiary-dark focus:border-borderAccent-light dark:focus:border-borderAccent-dark',
              dropdown:
                'bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark border border-borderPrimary-light dark:border-borderPrimary-dark shadow-lg',
            }}
          />

          <Checkbox
            label="Include header row"
            checked={includeHeader}
            onChange={(e) => setIncludeHeader(e.currentTarget.checked)}
            data-testid={setDataTestId('export-include-header')}
          />

          <Box style={{ height: 240, overflow: 'auto' }}>
            <Tabs value={format} keepMounted={false}>
              <Tabs.Panel value="csv">
                <Stack gap="xs">
                  <TextInput
                    label="Delimiter"
                    value={delimiter}
                    onChange={(e) => setDelimiter(e.currentTarget.value)}
                    data-testid={setDataTestId('export-csv-delimiter')}
                    error={delimiterError}
                    size="sm"
                    classNames={{
                      input:
                        'border-borderPrimary-light dark:border-borderPrimary-dark rounded-md text-sm leading-none px-4 py-2',
                    }}
                  />
                  <TextInput
                    label="Quote Character"
                    value={quoteChar}
                    onChange={(e) => setQuoteChar(e.currentTarget.value)}
                    error={quoteCharError}
                    size="sm"
                    classNames={{
                      input:
                        'border-borderPrimary-light dark:border-borderPrimary-dark rounded-md text-sm leading-none px-4 py-2',
                    }}
                  />
                  <TextInput
                    label="Escape Character"
                    value={escapeChar}
                    onChange={(e) => setEscapeChar(e.currentTarget.value)}
                    error={escapeCharError}
                    size="sm"
                    classNames={{
                      input:
                        'border-borderPrimary-light dark:border-borderPrimary-dark rounded-md text-sm leading-none px-4 py-2',
                    }}
                  />
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="tsv">
                <Stack gap="xs">
                  <TextInput
                    label="Quote Character"
                    value={quoteChar}
                    onChange={(e) => setQuoteChar(e.currentTarget.value)}
                    error={quoteCharError}
                    size="sm"
                    classNames={{
                      input:
                        'border-borderPrimary-light dark:border-borderPrimary-dark rounded-md text-sm leading-none px-4 py-2',
                    }}
                  />
                  <TextInput
                    label="Escape Character"
                    value={escapeChar}
                    onChange={(e) => setEscapeChar(e.currentTarget.value)}
                    error={escapeCharError}
                    size="sm"
                    classNames={{
                      input:
                        'border-borderPrimary-light dark:border-borderPrimary-dark rounded-md text-sm leading-none px-4 py-2',
                    }}
                  />
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="xlsx">
                <Stack gap="xs">
                  <TextInput
                    label="Sheet Name"
                    value={sheetName}
                    onChange={(e) => setSheetName(e.currentTarget.value)}
                    data-testid={setDataTestId('export-xlsx-sheet-name')}
                    error={sheetNameError}
                    size="sm"
                    classNames={{
                      input:
                        'border-borderPrimary-light dark:border-borderPrimary-dark rounded-md text-sm leading-none px-4 py-2',
                    }}
                  />
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="sql">
                <Stack gap="xs">
                  <TextInput
                    label="Table Name"
                    value={tableName}
                    onChange={(e) => setTableName(e.currentTarget.value)}
                    data-testid={setDataTestId('export-sql-table-name')}
                    error={tableNameError}
                    size="sm"
                    classNames={{
                      input:
                        'border-borderPrimary-light dark:border-borderPrimary-dark rounded-md text-sm leading-none px-4 py-2',
                    }}
                  />
                  <Checkbox
                    label="Include CREATE TABLE statement"
                    checked={includeCreateTable}
                    onChange={(e) => setIncludeCreateTable(e.currentTarget.checked)}
                  />
                  <Checkbox
                    label="Include column data types"
                    checked={includeDataTypes}
                    onChange={(e) => setIncludeDataTypes(e.currentTarget.checked)}
                    disabled={!includeCreateTable}
                  />
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="xml">
                <Stack gap="xs">
                  <TextInput
                    label="Root Element Name"
                    value={rootElement}
                    onChange={(e) => setRootElement(e.currentTarget.value)}
                    data-testid={setDataTestId('export-xml-root')}
                    error={rootElementError}
                    size="sm"
                    classNames={{
                      input:
                        'border-borderPrimary-light dark:border-borderPrimary-dark rounded-md text-sm leading-none px-4 py-2',
                    }}
                  />
                  <TextInput
                    label="Row Element Name"
                    value={rowElement}
                    onChange={(e) => setRowElement(e.currentTarget.value)}
                    data-testid={setDataTestId('export-xml-row')}
                    error={rowElementError}
                    size="sm"
                    classNames={{
                      input:
                        'border-borderPrimary-light dark:border-borderPrimary-dark rounded-md text-sm leading-none px-4 py-2',
                    }}
                  />
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="md">
                <Stack gap="xs">
                  <Select
                    label="Markdown Format"
                    data={[
                      { label: 'GitHub Markdown', value: 'github' },
                      { label: 'Standard Markdown', value: 'standard' },
                    ]}
                    value={mdFormat}
                    onChange={(value) => setMdFormat(value as 'github' | 'standard')}
                    data-testid={setDataTestId('export-md-format')}
                    size="sm"
                    classNames={{
                      input:
                        'border-borderPrimary-light dark:border-borderPrimary-dark rounded-md text-sm leading-none px-4 py-2',
                      dropdown:
                        'bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark border border-borderPrimary-light dark:border-borderPrimary-dark shadow-lg',
                    }}
                  />
                  <Checkbox
                    label="Align columns"
                    checked={alignColumns}
                    onChange={(e) => setAlignColumns(e.currentTarget.checked)}
                  />
                </Stack>
              </Tabs.Panel>
            </Tabs>
          </Box>

          {isLargeDataset && (
            <Alert
              icon={<IconAlertTriangle size={16} />}
              color="yellow"
              classNames={{
                root: 'rounded-md',
              }}
            >
              Large dataset ({largeDatasetSize.toLocaleString()} rows). Export may be slow.
            </Alert>
          )}

          <Group justify="flex-end" gap={4} mt="md">
            <Button
              variant="transparent"
              onClick={onClose}
              className="rounded-full px-3"
              c="text-secondary"
              data-testid={setDataTestId('export-cancel')}
            >
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              data-testid={setDataTestId('export-confirm')}
              color="background-accent"
              className="rounded-full px-3"
            >
              {isLargeDataset ? 'Export Anyway' : 'Export'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
