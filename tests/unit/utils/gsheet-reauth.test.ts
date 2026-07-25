import { showError, showWarningWithAction } from '@components/app-notifications';
import { persistPutDataSources } from '@controllers/data-source/persist';
import { createGSheetSecret } from '@controllers/db/data-source';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { GSheetSheetView, PersistentDataSourceId } from '@models/data-source';
import { requestGoogleAccessToken } from '@services/google-identity-services';
import { putSecret, SecretId } from '@services/secret-store';
import { useAppStore } from '@store/app-store';
import { getGoogleOAuthClientId } from '@utils/google-oauth-config';
import { notifyGSheetTokenExpired, reauthGSheetOAuth } from '@utils/gsheet-reauth';

jest.mock('@components/app-notifications');
jest.mock('@controllers/data-source/persist');
jest.mock('@controllers/db/data-source');
jest.mock('@services/google-identity-services');
jest.mock('@services/secret-store');
jest.mock('@utils/google-oauth-config');

const mockCreateGSheetSecret = createGSheetSecret as jest.MockedFunction<typeof createGSheetSecret>;
const mockGetGoogleOAuthClientId = getGoogleOAuthClientId as jest.MockedFunction<
  typeof getGoogleOAuthClientId
>;
const mockPersistPutDataSources = persistPutDataSources as jest.MockedFunction<
  typeof persistPutDataSources
>;
const mockPutSecret = putSecret as jest.MockedFunction<typeof putSecret>;
const mockRequestGoogleAccessToken = requestGoogleAccessToken as jest.MockedFunction<
  typeof requestGoogleAccessToken
>;
const mockShowError = showError as jest.MockedFunction<typeof showError>;
const mockShowWarningWithAction = showWarningWithAction as jest.MockedFunction<
  typeof showWarningWithAction
>;

const makeSource = (id: string, sheetName: string, viewName: string): GSheetSheetView => ({
  id: id as PersistentDataSourceId,
  type: 'gsheet-sheet',
  fileSourceId: 'google-sheet-group' as GSheetSheetView['fileSourceId'],
  viewName,
  spreadsheetId: 'abcdefghijklmnopqrstuvwxyz',
  spreadsheetName: 'payroll',
  spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz/edit',
  exportUrl: 'https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwxyz/export?format=xlsx',
  sheetName,
  accessMode: 'oauth',
  secretRef: 'credential-1' as SecretId,
  tokenExpiresAt: 1,
});

describe('reauthGSheetOAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetGoogleOAuthClientId.mockReturnValue('client.apps.googleusercontent.com');
    mockRequestGoogleAccessToken.mockResolvedValue({
      accessToken: 'ya29.fresh',
      expiresIn: 3600,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    });
    mockCreateGSheetSecret.mockResolvedValue(
      'pondpilot_gsheet_http_abcdefghijklmnopqrstuvwxyz_credential-1',
    );
    mockPutSecret.mockResolvedValue(undefined);
    mockPersistPutDataSources.mockResolvedValue(undefined);
  });

  it('updates one shared DuckDB secret without recreating every worksheet', async () => {
    const employees = makeSource('employees', 'Employees', 'payroll_employees');
    const contractors = makeSource('contractors', 'Contractors', 'payroll_contractors');
    const iDbConn = {} as Parameters<typeof putSecret>[0];
    useAppStore.setState({
      _iDbConn: iDbConn,
      dataSources: new Map([
        [employees.id, employees],
        [contractors.id, contractors],
      ]),
      googleOAuthToken: null,
    });
    const pool = {} as Parameters<typeof reauthGSheetOAuth>[0];

    await expect(reauthGSheetOAuth(pool, employees)).resolves.toBe(true);

    expect(mockCreateGSheetSecret).toHaveBeenCalledTimes(1);
    expect(mockCreateGSheetSecret).toHaveBeenCalledWith(
      pool,
      employees.spreadsheetUrl,
      'ya29.fresh',
      'credential-1',
    );
    expect(mockPutSecret).toHaveBeenCalledWith(iDbConn, employees.secretRef!, {
      label: 'Google Sheet: payroll',
      data: { accessToken: 'ya29.fresh' },
    });
    expect(mockPersistPutDataSources).toHaveBeenCalledWith(
      iDbConn,
      expect.arrayContaining([
        expect.objectContaining({ id: employees.id, tokenExpiresAt: expect.any(Number) }),
        expect.objectContaining({ id: contractors.id, tokenExpiresAt: expect.any(Number) }),
      ]),
    );
  });

  it('does not persist a successful re-auth state when DuckDB rejects the secret', async () => {
    const employees = makeSource('employees', 'Employees', 'payroll_employees');
    useAppStore.setState({
      _iDbConn: {} as Parameters<typeof putSecret>[0],
      dataSources: new Map([[employees.id, employees]]),
      googleOAuthToken: null,
    });
    mockCreateGSheetSecret.mockRejectedValue(new Error('secret update failed'));

    await expect(
      reauthGSheetOAuth({} as Parameters<typeof reauthGSheetOAuth>[0], employees),
    ).resolves.toBe(false);

    expect(mockPutSecret).not.toHaveBeenCalled();
    expect(mockPersistPutDataSources).not.toHaveBeenCalled();
    expect(mockShowError).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Re-authorization failed' }),
    );
  });

  it('keeps the token-expiry reauthorization action visible', () => {
    const employees = makeSource('employees', 'Employees', 'payroll_employees');

    notifyGSheetTokenExpired({} as Parameters<typeof notifyGSheetTokenExpired>[0], employees);

    expect(mockShowWarningWithAction).toHaveBeenCalledWith(
      expect.objectContaining({
        autoClose: false,
        title: 'Google session expired',
        action: expect.objectContaining({ label: 'Re-authorize' }),
      }),
    );
  });
});
