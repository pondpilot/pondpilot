import { Button, Group, Modal, Select, Stack, Text, TextInput, ActionIcon } from '@mantine/core';
import { NotebookParameter, NotebookParameterType } from '@models/notebook';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { memo, useEffect, useMemo, useState } from 'react';

import { validateNotebookParameterName } from '../utils/parameters';

type ParameterEditorRow = {
  id: string;
  name: string;
  type: NotebookParameterType;
  value: string;
};

interface NotebookParametersModalProps {
  opened: boolean;
  parameters: NotebookParameter[];
  onClose: () => void;
  onSave: (parameters: NotebookParameter[]) => void;
}

const TYPE_OPTIONS = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'null', label: 'Null' },
] as const;

function makeRowId(): string {
  return `param-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toEditorRows(parameters: NotebookParameter[]): ParameterEditorRow[] {
  return parameters.map((parameter) => {
    let value = '';

    if (parameter.type === 'text') {
      value = typeof parameter.value === 'string' ? parameter.value : String(parameter.value ?? '');
    } else if (parameter.type === 'number') {
      value = String(parameter.value ?? '0');
    } else if (parameter.type === 'boolean') {
      value = parameter.value ? 'true' : 'false';
    }

    return {
      id: makeRowId(),
      name: parameter.name,
      type: parameter.type,
      value,
    };
  });
}

function parseRows(
  rows: ParameterEditorRow[],
): { parameters: NotebookParameter[]; error: string | null } {
  const parameters: NotebookParameter[] = [];
  const existingNames = new Set<string>();

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const name = row.name.trim();
    const validationError = validateNotebookParameterName(name, existingNames);

    if (validationError) {
      return { parameters: [], error: `Row ${i + 1}: ${validationError}` };
    }

    existingNames.add(name.toLowerCase());

    if (row.type === 'text') {
      parameters.push({
        name,
        type: row.type,
        value: row.value,
      });
      continue;
    }

    if (row.type === 'number') {
      const numberValue = Number(row.value);
      if (!Number.isFinite(numberValue)) {
        return {
          parameters: [],
          error: `Row ${i + 1}: Number parameter "${name}" requires a finite numeric value.`,
        };
      }

      parameters.push({
        name,
        type: row.type,
        value: numberValue,
      });
      continue;
    }

    if (row.type === 'boolean') {
      if (row.value !== 'true' && row.value !== 'false') {
        return {
          parameters: [],
          error: `Row ${i + 1}: Boolean parameter "${name}" must be true or false.`,
        };
      }

      parameters.push({
        name,
        type: row.type,
        value: row.value === 'true',
      });
      continue;
    }

    parameters.push({
      name,
      type: 'null',
      value: null,
    });
  }

  return { parameters, error: null };
}

export const NotebookParametersModal = memo(({
  opened,
  parameters,
  onClose,
  onSave,
}: NotebookParametersModalProps) => {
  const [rows, setRows] = useState<ParameterEditorRow[]>(() => toEditorRows(parameters));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setRows(toEditorRows(parameters));
    setError(null);
  }, [opened, parameters]);

  const hasRows = rows.length > 0;
  const placeholderLabel = useMemo(
    () => 'Use in SQL as {{param_name}}',
    [],
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Notebook Parameters"
      size="lg"
      centered
    >
      <Stack gap="sm">
        {!hasRows && (
          <Text size="sm" c="dimmed">
            No parameters yet. Add one and reference it in SQL as <code>{'{{param_name}}'}</code>.
          </Text>
        )}

        {rows.map((row, index) => (
          <Group key={row.id} align="flex-end" wrap="nowrap" gap="xs">
            <TextInput
              label={index === 0 ? 'Name' : undefined}
              placeholder="region"
              value={row.name}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                setRows((prev) => prev.map((item) => (
                  item.id === row.id ? { ...item, name: nextValue } : item
                )));
              }}
              className="flex-1"
            />

            <Select
              label={index === 0 ? 'Type' : undefined}
              data={TYPE_OPTIONS as unknown as { value: string; label: string }[]}
              value={row.type}
              onChange={(nextValue) => {
                if (!nextValue) return;
                const nextType = nextValue as NotebookParameterType;
                setRows((prev) => prev.map((item) => {
                  if (item.id !== row.id) return item;
                  if (nextType === 'boolean') {
                    return { ...item, type: nextType, value: item.value === 'false' ? 'false' : 'true' };
                  }
                  if (nextType === 'null') {
                    return { ...item, type: nextType, value: '' };
                  }
                  if (nextType === 'number' && item.value.trim() === '') {
                    return { ...item, type: nextType, value: '0' };
                  }
                  return { ...item, type: nextType };
                }));
              }}
              w={110}
            />

            {row.type === 'boolean' ? (
              <Select
                label={index === 0 ? 'Value' : undefined}
                data={[
                  { value: 'true', label: 'true' },
                  { value: 'false', label: 'false' },
                ]}
                value={row.value || 'true'}
                onChange={(nextValue) => {
                  if (!nextValue) return;
                  setRows((prev) => prev.map((item) => (
                    item.id === row.id ? { ...item, value: nextValue } : item
                  )));
                }}
                w={120}
              />
            ) : (
              <TextInput
                label={index === 0 ? 'Value' : undefined}
                placeholder={row.type === 'null' ? 'NULL' : row.type === 'number' ? '42' : 'us-east'}
                value={row.type === 'null' ? '' : row.value}
                disabled={row.type === 'null'}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value;
                  setRows((prev) => prev.map((item) => (
                    item.id === row.id ? { ...item, value: nextValue } : item
                  )));
                }}
                className="flex-1"
              />
            )}

            <ActionIcon
              variant="subtle"
              color="red"
              onClick={() => {
                setRows((prev) => prev.filter((item) => item.id !== row.id));
              }}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        ))}

        <Group justify="space-between" mt="xs">
          <Button
            variant="subtle"
            leftSection={<IconPlus size={14} />}
            onClick={() => {
              setRows((prev) => [...prev, {
                id: makeRowId(),
                name: '',
                type: 'text',
                value: '',
              }]);
            }}
          >
            Add parameter
          </Button>

          <Text size="xs" c="dimmed">
            {placeholderLabel}
          </Text>
        </Group>

        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}

        <Group justify="flex-end" mt="sm">
          <Button variant="default" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              const parsed = parseRows(rows);
              if (parsed.error) {
                setError(parsed.error);
                return;
              }
              onSave(parsed.parameters);
              onClose();
            }}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
});

NotebookParametersModal.displayName = 'NotebookParametersModal';
