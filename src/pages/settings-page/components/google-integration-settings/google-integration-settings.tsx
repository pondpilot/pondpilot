import { Alert, Anchor, Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { IconInfoCircle, IconShieldCheck } from '@tabler/icons-react';
import { getGoogleOAuthClientId, saveGoogleOAuthClientId } from '@utils/google-oauth-config';
import { useCallback, useState } from 'react';

export const GoogleIntegrationSettings = () => {
  const savedClientId = getGoogleOAuthClientId();
  const [clientId, setClientId] = useState(() => savedClientId);
  const [isEditing, setIsEditing] = useState(() => savedClientId.length === 0);
  const hasValue = savedClientId.length > 0;

  const handleClientIdChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setClientId(event.currentTarget.value);
  }, []);

  const handleSave = useCallback(() => {
    saveGoogleOAuthClientId(clientId);
    setIsEditing(false);
  }, [clientId]);

  const handleCancel = useCallback(() => {
    setClientId(getGoogleOAuthClientId());
    setIsEditing(false);
  }, []);

  return (
    <Stack className="gap-4">
      <Group align="end" gap="xs" wrap="nowrap">
        <TextInput
          label="Google OAuth Client ID"
          description="Used to authenticate with Google Sheets via the Sign-In popup"
          placeholder="123456789.apps.googleusercontent.com"
          value={clientId}
          onChange={handleClientIdChange}
          disabled={!isEditing}
          className="flex-1"
        />
        {isEditing ? (
          <Group gap="xs" wrap="nowrap">
            <Button size="md" onClick={handleSave}>
              Save
            </Button>
            <Button size="md" variant="subtle" color="gray" onClick={handleCancel}>
              Cancel
            </Button>
          </Group>
        ) : (
          <Button size="md" variant="outline" onClick={() => setIsEditing(true)}>
            Edit
          </Button>
        )}
      </Group>

      <Alert icon={<IconInfoCircle size={16} />} color="background-accent" variant="light">
        <Stack gap="xs">
          <Text size="sm">
            To use Google Sign-In for private Google Sheets, create an OAuth Client ID:
          </Text>
          <Text size="sm" component="ol" className="list-decimal pl-4">
            <li>
              Create or select a project in{' '}
              <Anchor href="https://console.cloud.google.com/" target="_blank" c="blue">
                Google Cloud Console
              </Anchor>
            </li>
            <li>
              Go to{' '}
              <Anchor href="https://console.cloud.google.com/apis/credentials" target="_blank" c="blue">
                APIs &amp; Services → Credentials
              </Anchor>
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

    </Stack>
  );
};
