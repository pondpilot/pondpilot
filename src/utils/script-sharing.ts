/**
 * Utilities for encoding and decoding shared SQL scripts via URLs
 */

import { SQLScript } from '@models/sql-script';
import { makeSQLScriptId } from '@utils/sql-script';
import { gunzipSync, strFromU8 } from 'fflate';

/**
 * Decode URL-safe base64 to Uint8Array
 */
function base64UrlDecode(str: string): Uint8Array {
  // Restore standard base64 from URL-safe variant
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

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

    // Check for valid base64 characters (including URL-safe variants)
    if (!/^[A-Za-z0-9+/=_-]+$/.test(base64String)) {
      console.error('Invalid base64 string: contains invalid characters');
      return null;
    }

    let jsonString: string;

    // Try URL-safe base64 decode first to check for gzip
    try {
      const bytes = base64UrlDecode(base64String);

      // Check for gzip magic bytes (0x1f 0x8b)
      if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
        // Gzip compressed format (from Flowscope)
        jsonString = strFromU8(gunzipSync(bytes));
      } else {
        // Legacy format: standard base64 with URI-encoded JSON
        jsonString = decodeURIComponent(atob(base64String));
      }
    } catch {
      // Fallback to legacy format
      try {
        jsonString = decodeURIComponent(atob(base64String));
      } catch (e) {
        console.error('Error decoding base64 string:', e);
        return null;
      }
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
