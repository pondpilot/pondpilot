import { showWarning } from '@components/app-notifications';
import { reportRestoreIssues } from '@features/app-context/restore-issues';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@components/app-notifications');

const mockShowWarning = showWarning as jest.MockedFunction<typeof showWarning>;

describe('reportRestoreIssues', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows initialization warnings when no local files were discarded', () => {
    reportRestoreIssues(
      [],
      ['Google Sheet payroll is missing its saved token. Reconnect it in the wizard.'],
    );

    expect(mockShowWarning).toHaveBeenCalledWith({
      title: 'Initialization Warnings',
      message: 'Google Sheet payroll is missing its saved token. Reconnect it in the wizard.',
    });
  });

  it('does not show a notification when restore produced no issues', () => {
    reportRestoreIssues([], []);

    expect(mockShowWarning).not.toHaveBeenCalled();
  });
});
