import { NotebookParameter } from '@models/notebook';

const PARAMETER_NAME_PATTERN = /^[a-zA-Z_]\w*$/;
const PARAMETER_PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z_]\w*)\s*\}\}/g;

export function validateNotebookParameterName(
  name: string,
  existingLowercaseNames?: Set<string>,
): string | null {
  const trimmed = name.trim();

  if (!trimmed) {
    return 'Parameter name is required.';
  }

  if (!PARAMETER_NAME_PATTERN.test(trimmed)) {
    return 'Parameter name must be a valid SQL identifier (letters, digits, underscores, no leading digit).';
  }

  if (existingLowercaseNames?.has(trimmed.toLowerCase())) {
    return `Parameter "${trimmed}" is already defined.`;
  }

  return null;
}

export function parameterValueToSqlLiteral(parameter: NotebookParameter): string {
  switch (parameter.type) {
    case 'text': {
      const value =
        typeof parameter.value === 'string' ? parameter.value : String(parameter.value ?? '');
      return `'${value.replace(/'/g, "''")}'`;
    }
    case 'number': {
      const numericValue =
        typeof parameter.value === 'number' ? parameter.value : Number(parameter.value);
      if (!Number.isFinite(numericValue)) {
        throw new Error(`Parameter "${parameter.name}" must be a finite number.`);
      }
      return String(numericValue);
    }
    case 'boolean': {
      if (typeof parameter.value !== 'boolean') {
        throw new Error(`Parameter "${parameter.name}" must be true or false.`);
      }
      return parameter.value ? 'TRUE' : 'FALSE';
    }
    case 'null':
      return 'NULL';
    default:
      throw new Error(`Parameter "${parameter.name}" has unsupported type.`);
  }
}

export function resolveNotebookParametersInSql(
  sql: string,
  parameters?: NotebookParameter[] | null,
): { sql: string; errors: string[] } {
  if (!sql.trim()) {
    return { sql, errors: [] };
  }

  const parameterMap = new Map<string, NotebookParameter>();
  for (const parameter of parameters ?? []) {
    parameterMap.set(parameter.name.toLowerCase(), parameter);
  }

  const missing = new Set<string>();
  const renderErrors = new Set<string>();

  const resolvedSql = sql.replace(PARAMETER_PLACEHOLDER_PATTERN, (match, rawName: string) => {
    const parameter = parameterMap.get(rawName.toLowerCase());
    if (!parameter) {
      missing.add(rawName);
      return match;
    }

    try {
      return parameterValueToSqlLiteral(parameter);
    } catch (error) {
      renderErrors.add(error instanceof Error ? error.message : String(error));
      return match;
    }
  });

  const errors: string[] = [];

  if (missing.size > 0) {
    errors.push(`Missing notebook parameter(s): ${Array.from(missing).sort().join(', ')}`);
  }

  errors.push(...Array.from(renderErrors));

  return { sql: resolvedSql, errors };
}
