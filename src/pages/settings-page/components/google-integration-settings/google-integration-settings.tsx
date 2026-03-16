import { Alert, Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { IconInfoCircle, IconShieldCheck } from '@tabler/icons-react';
import { getGoogleOAuthClientId, saveGoogleOAuthClientId } from '@utils/google-oauth-config';
import { useCallback, useState } from 'react';

export const GoogleIntegrationSettings = () => {
  const [clientId, setClientId] = useState(() => getGoogleOAuthClientId());
  const [hasChanges, setHasChanges] = useState(false);

  const handleClientIdChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setClientId(event.currentTarget.value);
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(() => {
    saveGoogleOAuthClientId(clientId);
    setHasChanges(false);
  }, [clientId]);

  const handleReset = useCallback(() => {
    setClientId(getGoogleOAuthClientId());
    setHasChanges(false);
  }, []);

  return (
    <Stack className="gap-4">
      <TextInput
        label="Google OAuth Client ID"
        description="Used to authenticate with Google Sheets via the Sign-In popup"
        placeholder="123456789.apps.googleusercontent.com"
        value={clientId}
        onChange={handleClientIdChange}
      />

      <Alert icon={<IconInfoCircle size={16} />} color="background-accent" variant="light">
        <Stack gap="xs">
          <Text size="sm">
            To use Google Sign-In for private Google Sheets, create an OAuth Client ID:
          </Text>
          <Text size="sm" component="ol" className="list-decimal pl-4">
            <li>
              Go to{' '}
              <Text span fw={500}>
                Google Cloud Console → APIs &amp; Services → Credentials
              </Text>
            </li>
            <li>
              Create an{' '}
              <Text span fw={500}>
                OAuth Client ID
              </Text>{' '}
              (Web application type)
            </li>
            <li>
              Add{' '}
              <Text span className="font-mono" c="dimmed">
                {window.location.origin}
              </Text>{' '}
              to{' '}
              <Text span fw={500}>
                Authorized JavaScript origins
              </Text>
            </li>
            <li>Copy the Client ID and paste it above</li>
          </Text>
        </Stack>
      </Alert>

      <Alert icon={<IconShieldCheck size={16} />} color="background-accent" variant="light">
        <Text size="sm">
          <Text span fw={500}>
            Privacy:
          </Text>{' '}
          Your Client ID stays in this browser. PondPilot never sends it to any server.
          Authentication happens directly between your browser and Google.
        </Text>
      </Alert>

      <Group justify="space-between" className="mt-2">
        <Group>{hasChanges && <Button onClick={handleSave}>Save Changes</Button>}</Group>
        {hasChanges && (
          <Button color="text-error" onClick={handleReset} variant="outline">
            Reset
          </Button>
        )}
      </Group>
    </Stack>
  );
};
