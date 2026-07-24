import { describe, it, expect, beforeEach } from '@jest/globals';
import { getGoogleOAuthClientId, saveGoogleOAuthClientId } from '@utils/google-oauth-config';

describe('google-oauth-config', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getGoogleOAuthClientId', () => {
    it('should return empty string when nothing is stored', () => {
      expect(getGoogleOAuthClientId()).toBe('');
    });

    it('should return stored client ID', () => {
      localStorage.setItem('GOOGLE_OAUTH_CLIENT_ID', '123456.apps.googleusercontent.com');
      expect(getGoogleOAuthClientId()).toBe('123456.apps.googleusercontent.com');
    });

    it('should trim whitespace from stored value', () => {
      localStorage.setItem('GOOGLE_OAUTH_CLIENT_ID', '  123456.apps.googleusercontent.com  ');
      expect(getGoogleOAuthClientId()).toBe('123456.apps.googleusercontent.com');
    });

    it('should return empty string for whitespace-only stored value', () => {
      localStorage.setItem('GOOGLE_OAUTH_CLIENT_ID', '   ');
      expect(getGoogleOAuthClientId()).toBe('');
    });
  });

  describe('saveGoogleOAuthClientId', () => {
    it('should store a client ID', () => {
      saveGoogleOAuthClientId('123456.apps.googleusercontent.com');
      expect(localStorage.getItem('GOOGLE_OAUTH_CLIENT_ID')).toBe(
        '123456.apps.googleusercontent.com',
      );
    });

    it('should trim whitespace before storing', () => {
      saveGoogleOAuthClientId('  123456.apps.googleusercontent.com  ');
      expect(localStorage.getItem('GOOGLE_OAUTH_CLIENT_ID')).toBe(
        '123456.apps.googleusercontent.com',
      );
    });

    it('should remove the key when saving an empty string', () => {
      saveGoogleOAuthClientId('123456.apps.googleusercontent.com');
      expect(localStorage.getItem('GOOGLE_OAUTH_CLIENT_ID')).not.toBeNull();

      saveGoogleOAuthClientId('');
      expect(localStorage.getItem('GOOGLE_OAUTH_CLIENT_ID')).toBeNull();
    });

    it('should remove the key when saving whitespace-only string', () => {
      saveGoogleOAuthClientId('123456.apps.googleusercontent.com');
      saveGoogleOAuthClientId('   ');
      expect(localStorage.getItem('GOOGLE_OAUTH_CLIENT_ID')).toBeNull();
    });

    it('should overwrite a previously stored value', () => {
      saveGoogleOAuthClientId('old-id.apps.googleusercontent.com');
      saveGoogleOAuthClientId('new-id.apps.googleusercontent.com');
      expect(getGoogleOAuthClientId()).toBe('new-id.apps.googleusercontent.com');
    });
  });
});
