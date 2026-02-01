import { showError } from '@components/app-notifications';
import { APP_RELEASES_GITHUB_API_URL } from '@models/app-urls';
import { useEffect, useState } from 'react';

import { GitHubReleaseData } from './types';

export const useReleases = () => {
  const [releases, setReleases] = useState<GitHubReleaseData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReleases = async () => {
      try {
        const response = await fetch(APP_RELEASES_GITHUB_API_URL);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(`Error fetching releases: ${data.message}`);
        }

        setReleases(data);
      } catch (err) {
        console.error(err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);
        showError({
          title: 'Cannot load release notes',
          message,
          autoClose: 5000,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchReleases();
  }, []);

  return { releases, isLoading, error };
};
