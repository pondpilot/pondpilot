import { showError } from '@components/app-notifications';
import { ExportResult } from '@features/tab-view/hooks/use-table-export';
import {
  Modal,
  Button,
  TextInput,
  Group,
  Text,
  Box,
  Title,
  ActionIcon,
  Alert,
  Divider,
  Stack,
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
import { useState, useRef, useEffect } from 'react';

import {
  CsvOptions,
  TsvOptions,
  XlsxOptions,
  SqlOptions,
  XmlOptions,
  MarkdownOptions,
  FormatSelector,
} from './components';
import { LARGE_DATASET_THRESHOLD, commonTextInputClassNames } from './constants';
import { validateExportOptions } from './validation';

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

  // Data size warning state
  const [largeDatasetSize, setLargeDatasetSize] = useState(0);
  const [isLargeDataset, setIsLargeDataset] = useState(false);

  // Handle format change
  const handleFormatChange = (newFormat: ExportFormat) => {
    setFormat(newFormat);
    updateFilenameOnFormatChange(newFormat);
  };

  // Render format-specific options
  const renderFormatOptions = () => {
    switch (format) {
      case 'csv':
        return (
          <CsvOptions
            includeHeader={includeHeader}
            setIncludeHeader={setIncludeHeader}
            delimiter={delimiter}
            setDelimiter={setDelimiter}
            delimiterError={delimiterError}
            quoteChar={quoteChar}
            setQuoteChar={setQuoteChar}
            quoteCharError={quoteCharError}
            escapeChar={escapeChar}
            setEscapeChar={setEscapeChar}
            escapeCharError={escapeCharError}
          />
        );
      case 'tsv':
        return (
          <TsvOptions
            includeHeader={includeHeader}
            setIncludeHeader={setIncludeHeader}
            quoteChar={quoteChar}
            setQuoteChar={setQuoteChar}
            quoteCharError={quoteCharError}
            escapeChar={escapeChar}
            setEscapeChar={setEscapeChar}
            escapeCharError={escapeCharError}
          />
        );
      case 'xlsx':
        return (
          <XlsxOptions
            includeHeader={includeHeader}
            setIncludeHeader={setIncludeHeader}
            sheetName={sheetName}
            setSheetName={setSheetName}
            sheetNameError={sheetNameError}
          />
        );
      case 'sql':
        return (
          <SqlOptions
            tableName={tableName}
            setTableName={setTableName}
            tableNameError={tableNameError}
            includeCreateTable={includeCreateTable}
            setIncludeCreateTable={setIncludeCreateTable}
            includeDataTypes={includeDataTypes}
            setIncludeDataTypes={setIncludeDataTypes}
          />
        );
      case 'xml':
        return (
          <XmlOptions
            includeHeader={includeHeader}
            setIncludeHeader={setIncludeHeader}
            rootElement={rootElement}
            setRootElement={setRootElement}
            rootElementError={rootElementError}
            rowElement={rowElement}
            setRowElement={setRowElement}
            rowElementError={rowElementError}
          />
        );
      case 'md':
        return (
          <MarkdownOptions
            includeHeader={includeHeader}
            setIncludeHeader={setIncludeHeader}
            mdFormat={mdFormat}
            setMdFormat={setMdFormat}
            alignColumns={alignColumns}
            setAlignColumns={setAlignColumns}
          />
        );
      default:
        return null;
    }
  };

  const validateInputs = (): boolean => {
    const validationState = {
      filename: exportFilename,
      format,
      delimiter,
      quoteChar,
      escapeChar,
      sheetName,
      tableName,
      rootElement,
      rowElement,
    };

    const { isValid, errors } = validateExportOptions(validationState);

    // Set all error states
    setFilenameError(errors.filenameError);
    setDelimiterError(errors.delimiterError);
    setQuoteCharError(errors.quoteCharError);
    setEscapeCharError(errors.escapeCharError);
    setSheetNameError(errors.sheetNameError);
    setTableNameError(errors.tableNameError);
    setRootElementError(errors.rootElementError);
    setRowElementError(errors.rowElementError);

    return isValid;
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

  const handleExport = async () => {
    if (!validateInputs()) {
      return;
    }

    // Dismiss modal immediately as export progress will be shown in notifications
    onClose();
    performExport();
  };

  // Focus filename input when modal opens
  useEffect(() => {
    if (opened && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [opened]);

  // Check dataset size when modal opens
  useEffect(() => {
    if (opened) {
      try {
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

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        withCloseButton={false}
        padding={0}
        size="lg"
        radius="lg"
        classNames={{
          content: 'bg-backgroundPrimary-light dark:bg-backgroundPrimary-dark',
        }}
      >
        <Stack data-testid={setDataTestId('export-options-modal')} className="p-4 pt-8 gap-6">
          <Group justify="space-between" className="px-2">
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
          <Stack className="gap-16 px-6">
            <Box>
              <TextInput
                ref={inputRef}
                label="File Name"
                value={exportFilename}
                onChange={(e) => setExportFilename(e.currentTarget.value)}
                data-testid={setDataTestId('export-filename')}
                error={filenameError}
                size="md"
                mb="lg"
                classNames={commonTextInputClassNames}
              />

              <Text size="sm" c="dimmed" mb="lg">
                Choose a format and configure options to export your data.
              </Text>

              <Group align="stretch" gap="lg" wrap="nowrap">
                <FormatSelector format={format} onFormatChange={handleFormatChange} />
                <Divider orientation="vertical" />
                <Box mih={300} flex={1}>
                  {renderFormatOptions()}
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

            <Group justify="flex-end" gap="sm">
              <Button
                variant="subtle"
                onClick={onClose}
                color="text-secondary"
                data-testid={setDataTestId('export-cancel')}
                px={24}
              >
                Cancel
              </Button>
              <Button
                onClick={handleExport}
                data-testid={setDataTestId('export-confirm')}
                color="background-accent"
                px={24}
              >
                {isLargeDataset ? 'Export Anyway' : 'Export'}
              </Button>
            </Group>
          </Stack>
        </Stack>
      </Modal>
    </>
  );
}
