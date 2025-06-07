import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { showSuccess, showError } from '@components/app-notifications';
import { useAppStore } from '@store/app-store';
import { importScript, validateEncodedScript } from '@utils/script-import-utils';
import { SharedScript } from '@utils/script-sharing';

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

    const validationResult = validateEncodedScript(encodedScript);

    if (!validationResult.isValid) {
      showError({
        title: validationResult.title || 'Invalid shared script',
        message: validationResult.message || 'The shared script URL is invalid.',
      });
      navigate('/');
    } else if (validationResult.sharedScript) {
      setPendingScript(validationResult.sharedScript);
    }

    setValidationDone(true);
  }, [encodedScript, navigate, validationDone]);

  // Second step: Import the script when the app is ready
  useEffect(() => {
    if (!pendingScript || appLoadState !== 'ready') return;

    const doImportScript = async () => {
      try {
        const result = await importScript(encodedScript || '', false);

        if (result.success) {
          showSuccess({
            title: result.title,
            message: result.message,
          });
        } else {
          showError({
            title: result.title,
            message: result.message,
          });
        }

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
    };

    doImportScript();
  }, [pendingScript, appLoadState, navigate, encodedScript]);

  return null;
}
