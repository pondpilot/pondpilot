import { MIN_VERSION_INTERVAL_MS } from '@consts/version-history';
import { ScriptVersionController } from '@controllers/script-version';
import { ScriptVersion, VersionType } from '@models/script-version';
import { SQLScriptId } from '@models/sql-script';

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

/**
 * Result of a version creation attempt
 */
export type VersionCreationResult =
  | { success: true; version: ScriptVersion }
  | { success: false; reason: 'no_change' | 'too_soon' | 'error'; error?: Error };

/**
 * Options for saving a version if content has changed
 */
export interface SaveVersionIfChangedOptions {
  controller: ScriptVersionController;
  scriptId: SQLScriptId;
  content: string;
  type: VersionType;
  /** Content of the last saved version (for comparison) */
  lastVersionContent?: string;
  /** Timestamp of the last version creation (for rate limiting auto-saves) */
  lastVersionCreatedTime?: number;
}

/**
 * Shared helper for creating a script version if content has changed.
 * Encapsulates the common logic for version creation across the codebase:
 * - Checks if content differs from the last version
 * - Applies minimum interval for auto-saves (1 second)
 * - Creates the version with calculated metadata
 *
 * @param options Version creation options
 * @returns Result indicating success or failure with reason
 */
export async function saveVersionIfChanged(
  options: SaveVersionIfChangedOptions,
): Promise<VersionCreationResult> {
  const { controller, scriptId, content, type, lastVersionContent, lastVersionCreatedTime } =
    options;

  // Check if content has actually changed
  if (lastVersionContent !== undefined && content === lastVersionContent) {
    return { success: false, reason: 'no_change' };
  }

  // For auto-saves, apply rate limiting
  if (type === 'auto' && lastVersionCreatedTime !== undefined) {
    const timeSinceLastVersion = Date.now() - lastVersionCreatedTime;
    if (timeSinceLastVersion < MIN_VERSION_INTERVAL_MS) {
      return { success: false, reason: 'too_soon' };
    }
  }

  try {
    const version = await controller.createVersion({
      scriptId,
      content,
      type,
      metadata: getScriptMetadata(content),
    });
    return { success: true, version };
  } catch (error) {
    return {
      success: false,
      reason: 'error',
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Checks if a version should be created by comparing content with the latest version.
 * Used when we don't have the last version content cached.
 *
 * @param controller Version controller
 * @param scriptId Script ID
 * @param content Current content
 * @param type Version type
 * @returns Result indicating success or failure with reason
 */
export async function saveVersionIfContentDiffers(
  controller: ScriptVersionController,
  scriptId: SQLScriptId,
  content: string,
  type: VersionType,
): Promise<VersionCreationResult> {
  try {
    const latestVersion = await controller.getLatestVersionForScript(scriptId);

    // Create version if no versions exist or content differs
    if (!latestVersion || latestVersion.content !== content) {
      const version = await controller.createVersion({
        scriptId,
        content,
        type,
        metadata: getScriptMetadata(content),
      });
      return { success: true, version };
    }

    return { success: false, reason: 'no_change' };
  } catch (error) {
    return {
      success: false,
      reason: 'error',
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
