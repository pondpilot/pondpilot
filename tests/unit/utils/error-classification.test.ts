import { describe, it, expect } from '@jest/globals';

import {
  isCorsError,
  isNotReadableError,
  isNetworkError,
  getErrorMessage,
} from '../../../src/utils/error-classification';

describe('error-classification', () => {
  describe('isCorsError', () => {
    it('should return true for CORS errors', () => {
      expect(isCorsError(new Error('CORS policy blocked'))).toBe(true);
      expect(isCorsError(new Error('Cross-origin request failed'))).toBe(true);
    });

    it('should return true for network errors', () => {
      expect(isCorsError(new Error('Failed to fetch'))).toBe(true);
      expect(isCorsError(new Error('Failed to load resource'))).toBe(true);
      expect(isCorsError(new Error('NetworkError occurred'))).toBe(true);
      expect(isCorsError(new Error('Network error when accessing resource'))).toBe(true);
    });

    it('should return true for DuckDB httpfs errors', () => {
      expect(isCorsError(new Error('HTTP error code 403'))).toBe(true);
      expect(isCorsError(new Error('Unable to connect to http://example.com'))).toBe(true);
    });

    it('should return true for file opening errors with remote URLs', () => {
      expect(isCorsError(new Error('Failed opening file https://example.com/data.csv'))).toBe(true);
      expect(isCorsError(new Error('Cannot open file s3://bucket/data.parquet'))).toBe(true);
    });

    it('should return false for non-CORS errors', () => {
      expect(isCorsError(new Error('Syntax error in SQL'))).toBe(false);
      expect(isCorsError(new Error('Table not found'))).toBe(false);
      expect(isCorsError(new Error('Invalid column name'))).toBe(false);
    });

    it('should return false for non-Error objects', () => {
      expect(isCorsError('string error')).toBe(false);
      expect(isCorsError(null)).toBe(false);
      expect(isCorsError(undefined)).toBe(false);
      expect(isCorsError({})).toBe(false);
    });
  });

  describe('isNotReadableError', () => {
    it('should return true for NotReadableError by name', () => {
      const error = new Error('File not readable');
      error.name = 'NotReadableError';
      expect(isNotReadableError(error)).toBe(true);
    });

    it('should return true for NotReadableError by message', () => {
      expect(isNotReadableError(new Error('NotReadableError: file handle invalid'))).toBe(true);
      expect(isNotReadableError(new Error('File is not readable'))).toBe(true);
    });

    it('should return false for other errors', () => {
      expect(isNotReadableError(new Error('File not found'))).toBe(false);
      expect(isNotReadableError(new Error('Permission denied'))).toBe(false);
    });

    it('should return false for non-Error objects', () => {
      expect(isNotReadableError('NotReadableError')).toBe(false);
      expect(isNotReadableError(null)).toBe(false);
    });
  });

  describe('isNetworkError', () => {
    it('should return true for network-related errors', () => {
      expect(isNetworkError(new Error('Network timeout'))).toBe(true);
      expect(isNetworkError(new Error('Connection refused'))).toBe(true);
      expect(isNetworkError(new Error('Failed to fetch'))).toBe(true);
    });

    it('should return true for CORS errors (subset of network errors)', () => {
      expect(isNetworkError(new Error('CORS policy blocked'))).toBe(true);
    });

    it('should return false for non-network errors', () => {
      expect(isNetworkError(new Error('Syntax error'))).toBe(false);
    });

    it('should return false for non-Error objects', () => {
      expect(isNetworkError('network error')).toBe(false);
      expect(isNetworkError(null)).toBe(false);
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error objects', () => {
      expect(getErrorMessage(new Error('Test error'))).toBe('Test error');
    });

    it('should convert non-Error objects to strings', () => {
      expect(getErrorMessage('string error')).toBe('string error');
      expect(getErrorMessage(123)).toBe('123');
      expect(getErrorMessage(null)).toBe('null');
      expect(getErrorMessage(undefined)).toBe('undefined');
    });

    it('should handle objects without Error type', () => {
      expect(getErrorMessage({ message: 'custom error' })).toBe('[object Object]');
    });
  });
});
