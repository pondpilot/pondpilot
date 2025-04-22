import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { decodeBase64ToScript, SharedScript } from '@utils/script-sharing';
import { createSQLScript } from '@controllers/sql-script';
import { showSuccess, showError } from '@components/app-notifications';
import { getOrCreateTabFromScript } from '@controllers/tab';
import { useAppStore } from '@store/app-store';

/**
 * Component that handles importing a shared script from URL.
 * This gets rendered when a user navigates to /shared-script/:encodedScript
 */
export function SharedScriptImport() {
  const { encodedScript } = useParams<{ encodedScript: string }>();
  const navigate = useNavigate();
  const appLoadState = useAppStore.use.appLoadState();
  const [pendingScript, setPendingScript] = useState<SharedScript | null>(null);
  const [validationDone, setValidationDone] = useState(false);

  // First step: Validate and decode the script URL (only once)
  useEffect(() => {
    if (validationDone || !encodedScript) {
      if (!encodedScript) navigate('/');
      return;
    }

    if (encodedScript.length < 10) {
      showError({
        title: 'Invalid shared script',
        message:
          'The URL appears to be truncated or malformed. Make sure you copied the entire URL.',
      });
      navigate('/');
      setValidationDone(true);
      return;
    }

    let decodedScript;
    try {
      decodedScript = decodeURIComponent(encodedScript);
    } catch (error) {
      console.error('Error decoding URL component:', error);
      showError({
        title: 'Invalid shared script',
        message:
          'The URL contains invalid characters. Make sure you copied the entire URL correctly.',
      });
      navigate('/');
      setValidationDone(true);
      return;
    }

    const sharedScript = decodeBase64ToScript(decodedScript);

    if (!sharedScript) {
      showError({
        title: 'Invalid shared script',
        message:
          'Unable to decode the shared script. The URL may be corrupted or using an incompatible format.',
      });
      navigate('/');
      setValidationDone(true);
      return;
    }

    // Store the validated script for when the app is ready
    setPendingScript(sharedScript);
    setValidationDone(true);
  }, [encodedScript, navigate, validationDone]);

  // Second step: Import the script when the app is ready
  useEffect(() => {
    if (!pendingScript || appLoadState !== 'ready') return;

    try {
      const newScript = createSQLScript(pendingScript.name, pendingScript.content);

      getOrCreateTabFromScript(newScript.id, true);

      showSuccess({
        title: 'Script imported',
        message: `Successfully imported "${newScript.name}.sql"`,
      });

      setPendingScript(null);

      navigate('/');
    } catch (error) {
      console.error('Error importing shared script:', error);
      showError({
        title: 'Import failed',
        message: 'Failed to import the shared script. Please try again.',
      });
      navigate('/');
    }
  }, [pendingScript, appLoadState, navigate]);

  return null;
}
