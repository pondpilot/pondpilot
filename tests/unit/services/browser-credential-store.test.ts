import { BrowserCredentialStore } from '@services/browser-credential-store';

jest.mock('@utils/browser', () => ({
  isTauriEnvironment: () => false,
}));

const STORAGE_KEY = 'pondpilot_credentials';
const KEY_STORAGE_KEY = 'pondpilot_credentials_key';

describe('BrowserCredentialStore', () => {
  beforeEach(() => {
    BrowserCredentialStore.clear();
    global.localStorage.clear();
  });

  it('encrypts stored passwords and decrypts them on load', async () => {
    await BrowserCredentialStore.save('conn-1', {
      username: 'alice',
      password: 's3cr3t!',
      host: 'localhost',
    });

    const raw = JSON.parse(global.localStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(raw['conn-1']).toBeDefined();
    expect(raw['conn-1'].password).toBeDefined();
    expect(raw['conn-1'].password).not.toEqual('s3cr3t!');

    const loaded = await BrowserCredentialStore.get('conn-1');
    expect(loaded?.password).toEqual('s3cr3t!');
  });

  it('clears both credentials and encryption key', async () => {
    await BrowserCredentialStore.save('conn-keep', {
      username: 'bob',
      password: 'pass1234',
    });

    expect(global.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(global.localStorage.getItem(KEY_STORAGE_KEY)).not.toBeNull();

    BrowserCredentialStore.clear();

    expect(global.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(global.localStorage.getItem(KEY_STORAGE_KEY)).toBeNull();
  });

  it('throws when ciphertext is corrupted', async () => {
    await BrowserCredentialStore.save('conn-corrupt', {
      username: 'eva',
      password: 'secret!',
    });

    const raw = JSON.parse(global.localStorage.getItem(STORAGE_KEY) ?? '{}');
    raw['conn-corrupt'].password = 'invalid';
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));

    await expect(BrowserCredentialStore.get('conn-corrupt')).rejects.toThrow();
  });
});
