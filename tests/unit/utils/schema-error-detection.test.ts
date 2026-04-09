import { describe, expect, it } from '@jest/globals';

import { isRecoverableSchemaError, isSchemaError } from '../../../src/utils/schema-error-detection';

describe('schema-error-detection', () => {
  it('treats missing tables as schema errors but not auto-recoverable ones', () => {
    const error = new Error(
      'Catalog Error: Table with name store_purchases does not exist! Did you mean "main.sqlite_schema"?',
    );

    expect(isSchemaError(error)).toBe(true);
    expect(isRecoverableSchemaError(error)).toBe(false);
  });

  it('treats altered views as auto-recoverable schema errors', () => {
    const error = new Error('Catalog Error: Contents of view were altered: expected 2 columns');

    expect(isSchemaError(error)).toBe(true);
    expect(isRecoverableSchemaError(error)).toBe(true);
  });

  it('treats invalid columns as auto-recoverable schema errors', () => {
    const error = new Error(
      'Binder Error: Referenced column "department" not found in FROM clause',
    );

    expect(isSchemaError(error)).toBe(true);
    expect(isRecoverableSchemaError(error)).toBe(true);
  });
});
