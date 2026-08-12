import { showError, showSuccess } from '@components/app-notifications';
import {
  Alert,
  Anchor,
  Button,
  Code,
  Group,
  PasswordInput,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { AsyncDuckDBConnectionPool } from '@services/duckdb-pool/duckdb-connection-pool';
import { deleteSecret, makeSecretId, putSecret } from '@services/secret-store';
import { useAppStore } from '@store/app-store';
import { IconAlertCircle, IconDownload, IconShieldCheck } from '@tabler/icons-react';
import { toDuckDBIdentifier } from '@utils/duckdb/identifier';
import {
  attachAndIdentifyQuackRidge,
  detectQuackRidgePlatform,
  fetchQuackRidgeReleaseManifest,
  makeQuackRidgeConnection,
  pairWithQuackRidge,
  persistQuackRidgeConnection,
  QUACKRIDGE_RELEASE_MANIFEST_URL,
  QuackRidgePlatform,
  refreshQuackRidgeMetadata,
  selectQuackRidgeAsset,
} from '@utils/quackridge';
import { sanitizeErrorMessage } from '@utils/sanitize-error';
import { setDataTestId } from '@utils/test-id';
import { useEffect, useMemo, useState } from 'react';

interface QuackRidgeConfigProps {
  pool: AsyncDuckDBConnectionPool | null;
  onBack: () => void;
  onClose: () => void;
}

const PLATFORM_OPTIONS = [
  { value: 'darwin/arm64', label: 'macOS — Apple Silicon' },
  { value: 'darwin/amd64', label: 'macOS — Intel' },
  { value: 'linux/amd64', label: 'Linux — x86-64' },
  { value: 'windows/amd64', label: 'Windows — x86-64' },
];

export function QuackRidgeConfig({ pool, onBack, onClose }: QuackRidgeConfigProps) {
  const [mode, setMode] = useState<'pair' | 'manual'>('pair');
  const [challengeUrl, setChallengeUrl] = useState('');
  const [nonce, setNonce] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [token, setToken] = useState('');
  const [alias, setAlias] = useState('quackridge');
  const [isConnecting, setIsConnecting] = useState(false);
  const [manifestError, setManifestError] = useState<string | null>(null);
  const [manifest, setManifest] = useState<Awaited<
    ReturnType<typeof fetchQuackRidgeReleaseManifest>
  > | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchQuackRidgeReleaseManifest(QUACKRIDGE_RELEASE_MANIFEST_URL),
      detectQuackRidgePlatform(),
    ])
      .then(([nextManifest, detected]) => {
        if (!active) return;
        setManifest(nextManifest);
        setPlatform(detected ? `${detected.os}/${detected.arch}` : null);
      })
      .catch((error) => {
        if (active) setManifestError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, []);

  const selectedAsset = useMemo(() => {
    if (!manifest || !platform) return null;
    const [os, arch] = platform.split('/') as [
      QuackRidgePlatform['os'],
      QuackRidgePlatform['arch'],
    ];
    return selectQuackRidgeAsset(manifest, { os, arch });
  }, [manifest, platform]);

  const saveConnection = async (pairedEndpoint: string, pairedToken: string) => {
    if (!pool) throw new Error('PondPilot is still starting. Try again in a moment.');
    if (!alias.trim()) throw new Error('A database alias is required.');
    const { _iDbConn, dataSources } = useAppStore.getState();
    if (!_iDbConn) throw new Error('Encrypted secret storage is unavailable.');
    if (
      Array.from(dataSources.values()).some(
        (source) =>
          (source.type === 'quackridge' && source.alias === alias.trim()) ||
          ('dbName' in source && source.dbName === alias.trim()) ||
          ('catalogAlias' in source && source.catalogAlias === alias.trim()),
      )
    ) {
      throw new Error(`The database alias '${alias.trim()}' is already in use.`);
    }

    const identity = await attachAndIdentifyQuackRidge({
      pool,
      endpoint: pairedEndpoint,
      alias: alias.trim(),
      token: pairedToken,
    });
    const secretRef = makeSecretId();
    let secretStored = false;
    let connectionId: ReturnType<typeof makeQuackRidgeConnection>['id'] | null = null;
    try {
      await putSecret(_iDbConn, secretRef, {
        label: `QuackRidge: ${alias.trim()}`,
        data: { token: pairedToken },
      });
      secretStored = true;
      const connection = makeQuackRidgeConnection({
        endpoint: pairedEndpoint,
        alias: alias.trim(),
        identity,
        secretRef,
      });
      connectionId = connection.id;
      const next = new Map(useAppStore.getState().dataSources);
      next.set(connection.id, connection);
      useAppStore.setState({ dataSources: next }, false, 'QuackRidge/addConnection');
      await refreshQuackRidgeMetadata(pool, connection);
      await persistQuackRidgeConnection(connection);
    } catch (error) {
      await pool
        .query(`DETACH DATABASE IF EXISTS ${toDuckDBIdentifier(alias.trim())}`)
        .catch(() => undefined);
      if (secretStored) await deleteSecret(_iDbConn, secretRef).catch(() => undefined);
      if (connectionId) {
        const next = new Map(useAppStore.getState().dataSources);
        next.delete(connectionId);
        useAppStore.setState({ dataSources: next }, false, 'QuackRidge/addConnectionRollback');
      }
      throw error;
    }
  };

  const handleConnect = async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    try {
      if (mode === 'pair') {
        const paired = await pairWithQuackRidge(challengeUrl, nonce);
        await saveConnection(paired.endpoint, paired.token);
      } else {
        if (!token.trim()) throw new Error('The QuackRidge token is required.');
        await saveConnection(endpoint.trim(), token);
      }
      showSuccess({
        title: 'QuackRidge connected',
        message: 'The token was saved in PondPilot encrypted secret storage.',
      });
      onClose();
    } catch (error) {
      showError({
        title: 'Could not connect QuackRidge',
        message: sanitizeErrorMessage(error instanceof Error ? error.message : String(error)),
        autoClose: false,
      });
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <Stack gap={18} className="px-4">
      <Alert icon={<IconShieldCheck size={20} />} color="blue" variant="light">
        <Text size="sm" fw={600}>
          Install QuackRidge on this computer
        </Text>
        <Text size="xs" mt={4}>
          QuackRidge keeps PostgreSQL credentials and native query execution on your machine.
          PondPilot can download a signed package, but your browser cannot launch or install it.
        </Text>
      </Alert>

      <Stack gap={8}>
        <Select
          label="Installer platform"
          description="Detection is intentionally conservative. Choose manually when unsure."
          data={PLATFORM_OPTIONS}
          value={platform}
          onChange={setPlatform}
          placeholder="Select your operating system"
          data-testid={setDataTestId('quackridge-platform-select')}
        />
        {manifestError && (
          <Alert icon={<IconAlertCircle size={18} />} color="red" variant="light">
            {manifestError} You can install QuackRidge manually and connect below.
          </Alert>
        )}
        {selectedAsset && manifest && (
          <Stack gap={6}>
            <Button
              component="a"
              href={selectedAsset.url}
              target="_blank"
              rel="noopener noreferrer"
              leftSection={<IconDownload size={16} />}
              variant="light"
              data-testid={setDataTestId('download-quackridge-button')}
            >
              Download signed QuackRidge {manifest.version}
            </Button>
            <Text size="xs" c="text-secondary">
              Minimum OS: {selectedAsset.minimum_os}. SHA-256: <Code>{selectedAsset.sha256}</Code>
            </Text>
          </Stack>
        )}
        <Anchor
          href="https://github.com/pondpilot/quackridge/releases"
          target="_blank"
          rel="noopener noreferrer"
          size="xs"
        >
          View manual installation options and signatures
        </Anchor>
      </Stack>

      <SegmentedControl
        value={mode}
        onChange={(value) => setMode(value as 'pair' | 'manual')}
        data={[
          { label: 'Pair automatically', value: 'pair' },
          { label: 'Enter details manually', value: 'manual' },
        ]}
        data-testid={setDataTestId('quackridge-mode-selector')}
      />

      {mode === 'pair' ? (
        <Stack gap={12}>
          <Text size="sm" c="text-secondary">
            Start pairing in QuackRidge for this PondPilot origin, then paste the temporary URL and
            one-time code. Codes expire quickly and work once.
          </Text>
          <TextInput
            label="Temporary pairing URL"
            placeholder="http://127.0.0.1:12345/v1/pair"
            value={challengeUrl}
            onChange={(event) => setChallengeUrl(event.currentTarget.value)}
            data-testid={setDataTestId('quackridge-pairing-url-input')}
          />
          <PasswordInput
            label="One-time pairing code"
            value={nonce}
            onChange={(event) => setNonce(event.currentTarget.value)}
            data-testid={setDataTestId('quackridge-pairing-code-input')}
          />
        </Stack>
      ) : (
        <Stack gap={12}>
          <Alert icon={<IconAlertCircle size={18} />} color="yellow" variant="light">
            Manual mode is intended for development and recovery. Only local loopback endpoints are
            accepted.
          </Alert>
          <TextInput
            label="Quack endpoint"
            placeholder="quack:127.0.0.1:9494"
            value={endpoint}
            onChange={(event) => setEndpoint(event.currentTarget.value)}
            data-testid={setDataTestId('quackridge-endpoint-input')}
          />
          <PasswordInput
            label="QuackRidge token"
            value={token}
            onChange={(event) => setToken(event.currentTarget.value)}
            data-testid={setDataTestId('quackridge-token-input')}
          />
        </Stack>
      )}

      <TextInput
        label="Database alias"
        value={alias}
        onChange={(event) => setAlias(event.currentTarget.value)}
        data-testid={setDataTestId('quackridge-alias-input')}
      />

      <Group justify="space-between">
        <Button variant="default" onClick={onBack}>
          Back
        </Button>
        <Button
          loading={isConnecting}
          onClick={handleConnect}
          data-testid={setDataTestId('connect-quackridge-button')}
        >
          Connect QuackRidge
        </Button>
      </Group>
    </Stack>
  );
}
