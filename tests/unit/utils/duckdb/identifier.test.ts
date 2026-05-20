import { describe, expect, it } from '@jest/globals';
import {
  buildUseStatement,
  CatalogSchemaSelection,
  needsCatalogSchemaReapply,
} from '@utils/duckdb/identifier';

describe('buildUseStatement', () => {
  it('emits the fully-qualified form when both catalog and schema are present', () => {
    expect(buildUseStatement('mydb', 'public')).toBe('USE mydb.public');
  });

  it('quotes catalog and schema parts that are not bare identifiers', () => {
    // Spaces force quoting; the qualified form must keep both parts quoted.
    expect(buildUseStatement('my db', 'my schema')).toBe('USE "my db"."my schema"');
  });

  it('emits a catalog-only statement when schema is missing', () => {
    expect(buildUseStatement('mydb', null)).toBe('USE mydb');
  });

  it('emits a schema-only statement when catalog is missing', () => {
    expect(buildUseStatement(null, 'public')).toBe('USE public');
  });

  it('returns null when neither catalog nor schema is supplied', () => {
    expect(buildUseStatement(null, null)).toBeNull();
    expect(buildUseStatement(undefined, undefined)).toBeNull();
  });
});

describe('needsCatalogSchemaReapply', () => {
  const selection = (catalog: string | null, schema: string | null): CatalogSchemaSelection => ({
    catalog,
    schema,
  });

  it('always needs application when nothing was applied before', () => {
    // A freshly created or replaced connection has no recorded selection.
    expect(needsCatalogSchemaReapply(undefined, selection('mydb', 'public'))).toBe(true);
    expect(needsCatalogSchemaReapply(undefined, selection(null, null))).toBe(true);
  });

  it('skips re-application when the selection is unchanged', () => {
    // This is the core of the fix: an unchanged session must NOT re-issue USE,
    // otherwise interim state like SET search_path is collapsed on every reuse.
    expect(
      needsCatalogSchemaReapply(selection('mydb', 'public'), selection('mydb', 'public')),
    ).toBe(false);
    expect(needsCatalogSchemaReapply(selection(null, null), selection(null, null))).toBe(false);
    expect(needsCatalogSchemaReapply(selection('mydb', null), selection('mydb', null))).toBe(false);
  });

  it('needs re-application when the catalog changes', () => {
    expect(
      needsCatalogSchemaReapply(selection('mydb', 'public'), selection('other', 'public')),
    ).toBe(true);
    expect(needsCatalogSchemaReapply(selection(null, 'public'), selection('mydb', 'public'))).toBe(
      true,
    );
  });

  it('needs re-application when the schema changes', () => {
    expect(
      needsCatalogSchemaReapply(selection('mydb', 'public'), selection('mydb', 'staging')),
    ).toBe(true);
    expect(needsCatalogSchemaReapply(selection('mydb', 'public'), selection('mydb', null))).toBe(
      true,
    );
  });
});
