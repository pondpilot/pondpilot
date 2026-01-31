import { describe, it, expect } from '@jest/globals';

import { parseCreateSecretStatement } from '../../../src/utils/attach-parser';

describe('parseCreateSecretStatement', () => {
  it('should parse a basic CREATE SECRET with TYPE s3 and credentials', () => {
    const sql =
      "CREATE SECRET my_s3_secret (TYPE s3, KEY_ID 'AKIA1234', SECRET 'mysecret', REGION 'us-east-1')";
    const result = parseCreateSecretStatement(sql);

    expect(result).not.toBeNull();
    expect(result?.secretName).toBe('my_s3_secret');
    expect(result?.secretType).toBe('s3');
    expect(result?.options).toEqual({
      KEY_ID: 'AKIA1234',
      SECRET: 'mysecret',
      REGION: 'us-east-1',
    });
    expect(result?.statement).toBe(sql);
  });

  it('should parse CREATE OR REPLACE SECRET', () => {
    const sql =
      "CREATE OR REPLACE SECRET my_secret (TYPE iceberg, CLIENT_ID 'id', CLIENT_SECRET 'sec')";
    const result = parseCreateSecretStatement(sql);

    expect(result).not.toBeNull();
    expect(result?.secretName).toBe('my_secret');
    expect(result?.secretType).toBe('iceberg');
    expect(result?.options.CLIENT_ID).toBe('id');
    expect(result?.options.CLIENT_SECRET).toBe('sec');
  });

  it('should parse CREATE SECRET IF NOT EXISTS', () => {
    const sql =
      "CREATE SECRET IF NOT EXISTS my_secret (TYPE s3, KEY_ID 'key123', SECRET 'secret456')";
    const result = parseCreateSecretStatement(sql);

    expect(result).not.toBeNull();
    expect(result?.secretName).toBe('my_secret');
    expect(result?.secretType).toBe('s3');
    expect(result?.options.KEY_ID).toBe('key123');
  });

  it('should parse CREATE OR REPLACE SECRET IF NOT EXISTS', () => {
    const sql =
      "CREATE OR REPLACE SECRET IF NOT EXISTS combined_secret (TYPE iceberg, TOKEN 'tok123')";
    const result = parseCreateSecretStatement(sql);

    expect(result).not.toBeNull();
    expect(result?.secretName).toBe('combined_secret');
    expect(result?.secretType).toBe('iceberg');
    expect(result?.options.TOKEN).toBe('tok123');
  });

  it('should be case-insensitive for keywords', () => {
    const sql = "create secret my_secret (type S3, key_id 'key', secret 'sec')";
    const result = parseCreateSecretStatement(sql);

    expect(result).not.toBeNull();
    expect(result?.secretName).toBe('my_secret');
    expect(result?.secretType).toBe('s3');
    expect(result?.options.KEY_ID).toBe('key');
    expect(result?.options.SECRET).toBe('sec');
  });

  it('should handle double-quoted values', () => {
    const sql = 'CREATE SECRET my_secret (TYPE s3, KEY_ID "my_key", SECRET "my_secret_val")';
    const result = parseCreateSecretStatement(sql);

    expect(result).not.toBeNull();
    expect(result?.options.KEY_ID).toBe('my_key');
    expect(result?.options.SECRET).toBe('my_secret_val');
  });

  it('should return null for non-CREATE SECRET statements', () => {
    expect(parseCreateSecretStatement('SELECT 1')).toBeNull();
    expect(parseCreateSecretStatement('CREATE TABLE foo (id INT)')).toBeNull();
    expect(parseCreateSecretStatement('DROP SECRET my_secret')).toBeNull();
    expect(parseCreateSecretStatement('')).toBeNull();
  });

  it('should return null if no TYPE option is present', () => {
    const sql = "CREATE SECRET my_secret (KEY_ID 'key', SECRET 'sec')";
    expect(parseCreateSecretStatement(sql)).toBeNull();
  });

  it('should return null for malformed options block', () => {
    // No closing parenthesis
    const sql = "CREATE SECRET my_secret (TYPE s3, KEY_ID 'key'";
    expect(parseCreateSecretStatement(sql)).toBeNull();
  });

  it('should not include TYPE in the options record', () => {
    const sql = "CREATE SECRET my_secret (TYPE s3, KEY_ID 'key')";
    const result = parseCreateSecretStatement(sql);

    expect(result).not.toBeNull();
    expect(result?.options).not.toHaveProperty('TYPE');
    expect(result?.options.KEY_ID).toBe('key');
  });

  it('should handle OAuth2 credentials', () => {
    const sql =
      "CREATE SECRET ice_creds (TYPE iceberg, CLIENT_ID 'cid', CLIENT_SECRET 'csec', OAUTH2_SERVER_URI 'https://auth.example.com/token')";
    const result = parseCreateSecretStatement(sql);

    expect(result).not.toBeNull();
    expect(result?.secretType).toBe('iceberg');
    expect(result?.options.CLIENT_ID).toBe('cid');
    expect(result?.options.CLIENT_SECRET).toBe('csec');
    expect(result?.options.OAUTH2_SERVER_URI).toBe('https://auth.example.com/token');
  });

  it('should handle a bearer token secret', () => {
    const sql = "CREATE SECRET bearer_sec (TYPE iceberg, TOKEN 'my-token-value')";
    const result = parseCreateSecretStatement(sql);

    expect(result).not.toBeNull();
    expect(result?.options.TOKEN).toBe('my-token-value');
  });
});
