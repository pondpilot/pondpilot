import { SecretMetadata, SecretType } from '@models/secrets';
import { SecretsAPI } from '@services/secrets-api';
import { useCallback, useEffect, useState } from 'react';

export interface SecretOption {
  metadata: SecretMetadata;
  type: SecretType;
}

export function useSecretsByType(secretTypes: SecretType[]) {
  const [secrets, setSecrets] = useState<SecretOption[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSecrets = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        secretTypes.map(async (type) => {
          try {
            const list = await SecretsAPI.listSecrets(type);
            return list.map((metadata) => ({ metadata, type }) as SecretOption);
          } catch (error) {
            console.error(`Failed to load secrets for ${type}:`, error);
            return [];
          }
        }),
      );
      setSecrets(results.flat());
    } finally {
      setLoading(false);
    }
  }, [secretTypes]);

  useEffect(() => {
    loadSecrets();
  }, [loadSecrets]);

  return { secrets, loading, refresh: loadSecrets };
}
