import { createSQLScript } from '@controllers/sql-script';
import { getOrCreateTabFromScript } from '@controllers/tab';
import { decodeBase64ToScript, SharedScript } from './script-sharing';

/**
 * Interface for script import result
 */
export interface ScriptImportResult {
  success: boolean;
  message: string;
  title: string;
  scriptId?: string;
}

/**
 * Interface for script validation result
 */
export interface ScriptValidationResult {
  isValid: boolean;
  message?: string;
  title?: string;
  sharedScript?: SharedScript;
}

/**
 * Validates an encoded script without importing it
 * @param encodedScript The encoded script from the URL
 * @returns Validation result with the decoded script if valid
 */
export function validateEncodedScript(encodedScript: string): ScriptValidationResult {
  if (!encodedScript || encodedScript.length < 10) {
    return {
      isValid: false,
      title: 'Invalid shared script',
      message: 'The URL appears to be truncated or malformed. Make sure you copied the entire URL.',
    };
  }

  let decodedScript;
  try {
    decodedScript = decodeURIComponent(encodedScript);
  } catch (error) {
    console.error('Error decoding URL component:', error);
    return {
      isValid: false,
      title: 'Invalid shared script',
      message:
        'The URL contains invalid characters. Make sure you copied the entire URL correctly.',
    };
  }

  const sharedScript = decodeBase64ToScript(decodedScript);
  if (!sharedScript) {
    return {
      isValid: false,
      title: 'Invalid shared script',
      message:
        'Unable to decode the shared script. The URL may be corrupted or using an incompatible format.',
    };
  }

  return {
    isValid: true,
    sharedScript,
  };
}

/**
 * Extracts the encoded script part from a full shared script URL
 * @param url The full shared script URL
 * @returns The encoded script part or null if not found
 */
function extractEncodedScriptFromUrl(url: string): string | null {
  const match = url.match(/\/shared-script\/([^/]+)$/);
  return match ? match[1] : null;
}

/**
 * Creates a script in the application from a shared script object
 * @param sharedScript The shared script object with name and content
 * @returns Import result with success status
 */
function createScriptFromShared(sharedScript: SharedScript): ScriptImportResult {
  try {
    const newScript = createSQLScript(sharedScript.name, sharedScript.content);

    getOrCreateTabFromScript(newScript.id, true);

    return {
      success: true,
      title: 'Script imported',
      message: `Successfully imported "${newScript.name}.sql"`,
      scriptId: newScript.id,
    };
  } catch (error) {
    console.error('Error creating script:', error);
    return {
      success: false,
      title: 'Import failed',
      message: 'An error occurred while creating the script.',
    };
  }
}

/**
 * Imports a script from either a full URL or an encoded string
 * @param input Either a full shared script URL or an encoded script string
 * @param isFullUrl Whether the input is a full URL (true) or an encoded string (false)
 * @returns Object with import result data
 */
export async function importScript(
  input: string,
  isFullUrl: boolean = true,
): Promise<ScriptImportResult> {
  try {
    let encodedScript: string | null = input;

    if (isFullUrl) {
      encodedScript = extractEncodedScriptFromUrl(input);
      if (!encodedScript) {
        return {
          success: false,
          title: 'Invalid URL format',
          message: 'The URL does not appear to be a valid shared script URL.',
        };
      }
    }

    const validationResult = validateEncodedScript(encodedScript);
    if (!validationResult.isValid || !validationResult.sharedScript) {
      return {
        success: false,
        title: validationResult.title || 'Invalid shared script',
        message: validationResult.message || 'Unable to decode the shared script.',
      };
    }

    return createScriptFromShared(validationResult.sharedScript);
  } catch (error) {
    console.error('Error importing script:', error);
    return {
      success: false,
      title: 'Import failed',
      message: 'An unexpected error occurred while importing the script.',
    };
  }
}
