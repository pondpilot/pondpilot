import { ScriptVersion } from '@models/script-version';

/**
 * Calculates metadata for a script version based on its content
 * @param content The script content
 * @returns Metadata object with lines and character counts
 */
export function getScriptMetadata(content: string): ScriptVersion['metadata'] {
  return {
    linesCount: content.split('\n').length,
    charactersCount: content.length,
  };
}
