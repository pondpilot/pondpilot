import { AppIdbSchema } from '@models/persisted-store';
import {
  ScriptVersion,
  ScriptVersionId,
  SCRIPT_VERSION_TABLE_NAME,
  VersionType,
} from '@models/script-version';
import { SQLScriptId } from '@models/sql-script';
import { makeIdFactory } from '@utils/new-id';
import { getScriptMetadata } from '@utils/script-version';
import { IDBPDatabase } from 'idb';

const makeVersionId = makeIdFactory<ScriptVersionId>();

export interface CreateVersionOptions {
  scriptId: SQLScriptId;
  content: string;
  type: VersionType;
  name?: string;
  metadata?: ScriptVersion['metadata'];
}

export interface ScriptVersionController {
  /**
   * Creates a new script version
   * @param options Version creation options including script ID, content, and type
   * @returns The newly created script version
   */
  createVersion: (options: CreateVersionOptions) => Promise<ScriptVersion>;

  /**
   * Gets all versions for a specific script
   * @param scriptId The ID of the script
   * @returns Array of script versions sorted by timestamp (newest first)
   */
  getVersionsByScriptId: (scriptId: SQLScriptId) => Promise<ScriptVersion[]>;

  /**
   * Gets a specific version by ID
   * @param versionId The ID of the version to retrieve
   * @returns The script version or undefined if not found
   */
  getVersion: (versionId: ScriptVersionId) => Promise<ScriptVersion | undefined>;

  /**
   * Deletes a specific version
   * @param versionId The ID of the version to delete
   */
  deleteVersion: (versionId: ScriptVersionId) => Promise<void>;

  /**
   * Deletes all versions for a specific script
   * @param scriptId The ID of the script whose versions should be deleted
   */
  deleteVersionsForScript: (scriptId: SQLScriptId) => Promise<void>;

  /**
   * Gets the latest version for a specific script
   * @param scriptId The ID of the script
   * @returns The latest script version or undefined if no versions exist
   */
  getLatestVersionForScript: (scriptId: SQLScriptId) => Promise<ScriptVersion | undefined>;

  /**
   * Updates the name of an existing version
   * @param versionId The ID of the version to update
   * @param name The new name for the version
   * @returns The updated script version
   */
  updateVersionName: (versionId: ScriptVersionId, name: string) => Promise<ScriptVersion>;

  /**
   * Updates the name and description of an existing version
   * @param versionId The ID of the version to update
   * @param name The new name for the version
   * @param description The new description for the version
   * @returns The updated script version
   */
  updateVersionNameAndDescription: (
    versionId: ScriptVersionId,
    name: string,
    description?: string,
  ) => Promise<ScriptVersion>;
}

export function createScriptVersionController(
  db: IDBPDatabase<AppIdbSchema>,
): ScriptVersionController {
  return {
    async createVersion(options: CreateVersionOptions): Promise<ScriptVersion> {
      const version: ScriptVersion = {
        id: makeVersionId(),
        scriptId: options.scriptId,
        content: options.content,
        timestamp: Date.now(),
        type: options.type,
        name: options.name,
        metadata: options.metadata || getScriptMetadata(options.content),
      };

      await db.put(SCRIPT_VERSION_TABLE_NAME, version);
      return version;
    },

    async getVersionsByScriptId(scriptId: SQLScriptId): Promise<ScriptVersion[]> {
      const tx = db.transaction([SCRIPT_VERSION_TABLE_NAME], 'readonly');
      const index = tx.objectStore(SCRIPT_VERSION_TABLE_NAME).index('by-script');
      const versions = await index.getAll(scriptId);
      await tx.done;

      // Sort by timestamp descending (newest first)
      return versions.sort((a, b) => b.timestamp - a.timestamp);
    },

    async getVersion(versionId: ScriptVersionId): Promise<ScriptVersion | undefined> {
      return db.get(SCRIPT_VERSION_TABLE_NAME, versionId);
    },

    async deleteVersion(versionId: ScriptVersionId): Promise<void> {
      await db.delete(SCRIPT_VERSION_TABLE_NAME, versionId);
    },

    async deleteVersionsForScript(scriptId: SQLScriptId): Promise<void> {
      const tx = db.transaction([SCRIPT_VERSION_TABLE_NAME], 'readwrite');
      const index = tx.objectStore(SCRIPT_VERSION_TABLE_NAME).index('by-script');

      // Get all versions for this script
      const keys = await index.getAllKeys(scriptId);

      // Delete all versions in parallel
      await Promise.all(keys.map((key) => tx.objectStore(SCRIPT_VERSION_TABLE_NAME).delete(key)));

      await tx.done;
    },

    async getLatestVersionForScript(scriptId: SQLScriptId): Promise<ScriptVersion | undefined> {
      const versions = await this.getVersionsByScriptId(scriptId);
      return versions[0];
    },

    async updateVersionName(versionId: ScriptVersionId, name: string): Promise<ScriptVersion> {
      const version = await db.get(SCRIPT_VERSION_TABLE_NAME, versionId);
      if (!version) {
        throw new Error('Version not found');
      }

      const updatedVersion: ScriptVersion = {
        ...version,
        name,
        type: 'named',
      };

      await db.put(SCRIPT_VERSION_TABLE_NAME, updatedVersion);
      return updatedVersion;
    },

    async updateVersionNameAndDescription(
      versionId: ScriptVersionId,
      name: string,
      description?: string,
    ): Promise<ScriptVersion> {
      const version = await db.get(SCRIPT_VERSION_TABLE_NAME, versionId);
      if (!version) {
        throw new Error('Version not found');
      }

      const updatedVersion: ScriptVersion = {
        ...version,
        name,
        description,
        type: 'named',
      };

      await db.put(SCRIPT_VERSION_TABLE_NAME, updatedVersion);
      return updatedVersion;
    },
  };
}
