import { getLogger } from '@engines/debug-logger';
import { useExtensionManagementStore } from '@store/extension-management';

const logger = getLogger('extension-loader');

export class ExtensionLoader {
  /**
   * Load active extensions for a new database session
   */
  static async loadAutoExtensions(connectionPool: any): Promise<void> {
    try {
      const store = useExtensionManagementStore.getState();

      // Get all extensions that should be loaded (required + active optional)
      const requiredExtensions = store.extensions.filter((ext) => ext.required);
      const activeOptionalExtensions = store.getActiveExtensions();

      // Combine and deduplicate
      const extensionsToLoad = [
        ...requiredExtensions,
        ...activeOptionalExtensions.filter((ext) => !ext.required),
      ];

      if (extensionsToLoad.length === 0) {
        logger.debug('No extensions to load');
        return;
      }

      logger.info(
        `Loading ${extensionsToLoad.length} extensions (${requiredExtensions.length} required, ${activeOptionalExtensions.length} optional)`,
      );

      for (const extension of extensionsToLoad) {
        try {
          logger.debug(`Loading extension: ${extension.name}`);

          // First ensure the extension is installed
          if (!extension.installed) {
            const installCommand =
              extension.type === 'core'
                ? `INSTALL ${extension.name}`
                : `INSTALL ${extension.name} FROM community`;

            await connectionPool.query(installCommand);
            logger.debug(`Installed extension: ${extension.name}`);
          }

          // Then load the extension
          await connectionPool.query(`LOAD ${extension.name}`);
          logger.info(`Successfully loaded extension: ${extension.name}`);

          // Extension loaded successfully - state will be updated on next loadExtensions call
        } catch (error) {
          logger.error(`Failed to load extension ${extension.name}:`, error);
        }
      }

      logger.info('Active extensions loaded successfully');
    } catch (error) {
      logger.error('Failed to load auto-load extensions:', error);
    }
  }

  /**
   * Install and load a single extension
   */
  static async installAndLoadExtension(
    connectionPool: any,
    extensionName: string,
    isCore: boolean = true,
  ): Promise<void> {
    try {
      logger.debug(`Installing and loading extension: ${extensionName}`);

      // Install the extension
      const installCommand = isCore
        ? `INSTALL ${extensionName}`
        : `INSTALL ${extensionName} FROM community`;

      await connectionPool.query(installCommand);
      logger.debug(`Installed extension: ${extensionName}`);

      // Load the extension
      await connectionPool.query(`LOAD ${extensionName}`);
      logger.info(`Successfully loaded extension: ${extensionName}`);
    } catch (error) {
      logger.error(`Failed to install/load extension ${extensionName}:`, error);
      throw error;
    }
  }

  /**
   * Load a previously installed extension
   */
  static async loadExtension(connectionPool: any, extensionName: string): Promise<void> {
    try {
      logger.debug(`Loading extension: ${extensionName}`);
      await connectionPool.query(`LOAD ${extensionName}`);
      logger.info(`Successfully loaded extension: ${extensionName}`);
    } catch (error) {
      logger.error(`Failed to load extension ${extensionName}:`, error);
      throw error;
    }
  }

  /**
   * Uninstall an extension
   */
  static async uninstallExtension(connectionPool: any, extensionName: string): Promise<void> {
    try {
      logger.debug(`Uninstalling extension: ${extensionName}`);
      await connectionPool.query(`FORCE UNINSTALL ${extensionName}`);
      logger.info(`Successfully uninstalled extension: ${extensionName}`);
    } catch (error) {
      logger.error(`Failed to uninstall extension ${extensionName}:`, error);
      throw error;
    }
  }

  /**
   * List all installed extensions
   */
  static async listInstalledExtensions(connectionPool: any): Promise<string[]> {
    try {
      const result = await connectionPool.query(`
        SELECT extension_name 
        FROM duckdb_extensions() 
        WHERE installed = true
      `);

      return result.rows.map((row: any) => row.extension_name);
    } catch (error) {
      logger.error('Failed to list installed extensions:', error);
      return [];
    }
  }
}
