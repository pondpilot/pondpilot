/**
 * Utilities for encoding and decoding shared SQL scripts via URLs
 */

import { SQLScript } from '@models/sql-script';
import { makeSQLScriptId } from '@utils/sql-script';

/**
 * Shared script format (what gets encoded to URL)
 */
export interface SharedScript {
  name: string;
  content: string;
}

export function encodeScriptToBase64(script: SQLScript | SharedScript): string {
  const shareableScript: SharedScript = {
    name: script.name,
    content: script.content,
  };

  const jsonString = JSON.stringify(shareableScript);
  return btoa(encodeURIComponent(jsonString));
}

export function decodeBase64ToScript(base64String: string): SharedScript | null {
  try {
    if (!base64String || typeof base64String !== 'string' || base64String.length < 10) {
      console.error('Invalid base64 string: too short or not a string');
      return null;
    }

    if (!/^[A-Za-z0-9+/=]+$/.test(base64String)) {
      console.error('Invalid base64 string: contains invalid characters');
      return null;
    }

    let jsonString;
    try {
      jsonString = decodeURIComponent(atob(base64String));
    } catch (e) {
      console.error('Error decoding base64 string:', e);
      return null;
    }

    if (!jsonString.startsWith('{') || !jsonString.endsWith('}')) {
      console.error('Decoded string is not a valid JSON object');
      return null;
    }

    const script = JSON.parse(jsonString) as SharedScript;

    if (
      typeof script !== 'object' ||
      typeof script.name !== 'string' ||
      typeof script.content !== 'string'
    ) {
      console.error('Invalid script format: missing required properties');
      return null;
    }

    if (script.name.trim().length === 0) {
      console.error('Invalid script name: cannot be empty');
      return null;
    }

    return script;
  } catch (error) {
    console.error('Error decoding shared script:', error);
    return null;
  }
}

export function createShareableScriptUrl(script: SQLScript): string {
  const base64Script = encodeScriptToBase64(script);
  const encodedScript = encodeURIComponent(base64Script);
  return `${window.location.origin}/shared-script/${encodedScript}`;
}

export function sharedScriptToSQLScript(sharedScript: SharedScript): SQLScript {
  return {
    id: makeSQLScriptId(),
    name: sharedScript.name,
    content: sharedScript.content,
  };
}
