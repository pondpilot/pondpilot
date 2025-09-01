import { getLogger } from '@engines/debug-logger';
import { useExtensionManagementStore } from '@store/extension-management';
import { tauriLog } from '@utils/tauri-logger';

const logger = getLogger('extension-loader');

export class ExtensionLoader {
  private static errorToMessage(err: any): string {
    try {
      if (!err) return '';
      if (typeof err === 'string') return err;
      if (typeof (err as any).message === 'string') return (err as any).message;
      return JSON.stringify(err);
    } catch {
      try {
        return String(err);
      } catch {
        return '';
      }
    }
  }
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

      // Gate auto-installation of community extensions
      const allowCommunityAutoInstall = (() => {
        try {
          // Prefer explicit env override, otherwise allow on Tauri/DEV
          if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
            const v = (import.meta as any).env.VITE_ALLOW_COMMUNITY_EXTENSIONS;
            if (typeof v === 'string') return v === 'true';
          }
        } catch {
          // Ignore import.meta access errors
        }
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
          const { isTauriEnvironment } = require('@utils/browser');
          if (isTauriEnvironment && typeof isTauriEnvironment === 'function') {
            // Allow on desktop by default
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            if (isTauriEnvironment()) return true;
          }
        } catch {
          // Ignore Tauri environment check errors
        }
        try {
          return (import.meta as any).env?.DEV === true;
        } catch {
          // Ignore dev environment check errors
        }
        return false;
      })();

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

          // Attempt to load first
          try {
            await connectionPool.query(`LOAD ${extension.name}`);
            logger.info(`Successfully loaded extension: ${extension.name}`);
            continue;
          } catch (loadErr: any) {
            const msg = ExtensionLoader.errorToMessage(loadErr);
            logger.warn(`LOAD ${extension.name} failed. Error: ${msg}`);
          }

          // Decide whether we will attempt to install
          const canInstall =
            extension.type === 'core' ||
            (extension.type === 'community' && allowCommunityAutoInstall);
          if (!canInstall) {
            logger.warn(
              `Skipping auto-install of community extension ${extension.name}. Enable VITE_ALLOW_COMMUNITY_EXTENSIONS=true to allow installation.`,
            );
            continue;
          }

          // Install then load
          const installCommand =
            extension.type === 'core'
              ? `INSTALL ${extension.name}`
              : `INSTALL ${extension.name} FROM community`;
          try {
            await connectionPool.query(installCommand);
            logger.debug(`Installed extension: ${extension.name}`);
          } catch (installErr: any) {
            const msg = ExtensionLoader.errorToMessage(installErr);
            logger.error(`Failed to install extension ${extension.name}: ${msg}`);
            continue;
          }

          try {
            await connectionPool.query(`LOAD ${extension.name}`);
            logger.info(`Successfully loaded extension after install: ${extension.name}`);
          } catch (secondLoadErr: any) {
            const msg = ExtensionLoader.errorToMessage(secondLoadErr);
            logger.error(`Failed to load extension ${extension.name} after install: ${msg}`);
          }
        } catch (error) {
          logger.error(`Failed processing extension ${extension.name}:`, error);
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

  /**
   * Load extensions for a single connection
   * Used to ensure each connection in the pool has the required extensions loaded
   */
  static async loadExtensionsForConnection(connection: any): Promise<void> {
    try {
      // Wait for store to be hydrated from persistence before accessing extension state
      const { waitForExtensionStoreHydration } = await import('@store/extension-management');
      await waitForExtensionStoreHydration();

      const store = useExtensionManagementStore.getState();

      // Session settings to allow community/unsigned extensions and autoinstall
      try {
        await connection.execute('SET allow_unsigned_extensions = true');
      } catch (e) {
        logger.warn(
          `Failed to set allow_unsigned_extensions: ${ExtensionLoader.errorToMessage(e)}`,
        );
      }
      try {
        await connection.execute('SET autoinstall_known_extensions = true');
      } catch (e) {
        logger.warn(
          `Failed to set autoinstall_known_extensions: ${ExtensionLoader.errorToMessage(e)}`,
        );
      }

      // Get all required extensions
      const requiredExtensions = store.extensions.filter((ext) => ext.required);

      if (requiredExtensions.length === 0) {
        return;
      }

      logger.debug(`Loading ${requiredExtensions.length} required extensions for connection`);
      if ((import.meta as any).env?.DEV) {
        tauriLog(
          `[ExtensionLoader] Loading ${requiredExtensions.length} required extensions:`,
          requiredExtensions.map((e) => e.name).join(', '),
        );
      }

      const allowCommunityAutoInstall = await (async () => {
        try {
          if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
            const v = (import.meta as any).env.VITE_ALLOW_COMMUNITY_EXTENSIONS;
            if (typeof v === 'string') return v === 'true';
          }
        } catch {
          // Ignore environment check errors
        }
        try {
          const { isTauriEnvironment } = await import('@utils/browser');
          if (isTauriEnvironment()) return true;
        } catch {
          // Ignore environment check errors
        }
        return (import.meta as any).env?.DEV === true;
      })();

      for (const extension of requiredExtensions) {
        try {
          // First try to load the extension
          await connection.execute(`LOAD ${extension.name}`);
          logger.debug(`Loaded extension ${extension.name} for connection`);
        } catch (loadError: any) {
          // If loading fails, decide whether to install first then load
          const loadMsg = ExtensionLoader.errorToMessage(loadError);
          logger.warn(`LOAD ${extension.name} failed on connection. Error: ${loadMsg}`);
          if (!(extension.type === 'core' || allowCommunityAutoInstall)) {
            logger.warn(
              `Skipping auto-install of community extension ${extension.name} on connection (not allowed).`,
            );
            continue;
          }
          if ((import.meta as any).env?.DEV) {
            tauriLog(`[ExtensionLoader] LOAD failed for '${extension.name}', attempting install`);
          }

          try {
            logger.debug(`Extension ${extension.name} not installed, installing...`);
            if ((import.meta as any).env?.DEV) {
              tauriLog(
                `[ExtensionLoader] Installing extension '${extension.name}' (type: ${extension.type})`,
              );
            }
            const installCommand =
              extension.type === 'core'
                ? `INSTALL ${extension.name}`
                : `INSTALL ${extension.name} FROM community`;
            if ((import.meta as any).env?.DEV) {
              tauriLog(`[ExtensionLoader] Running: ${installCommand}`);
            }
            await connection.execute(installCommand);
            logger.debug(`Installed extension ${extension.name}`);

            // Now try to load again
            if ((import.meta as any).env?.DEV) {
              tauriLog(`[ExtensionLoader] Loading: LOAD ${extension.name}`);
            }
            await connection.execute(`LOAD ${extension.name}`);
            logger.debug(`Successfully loaded extension ${extension.name} after installation`);
            if ((import.meta as any).env?.DEV) {
              tauriLog(`[ExtensionLoader] Successfully installed and loaded '${extension.name}'`);
            }

            // Update store to reflect installation
            store.extensions = store.extensions.map((ext) =>
              ext.name === extension.name ? { ...ext, installed: true } : ext,
            );
          } catch (installError: any) {
            logger.error(`Failed to install and load extension ${extension.name}:`, installError);
            if ((import.meta as any).env?.DEV) {
              tauriLog(
                `[ExtensionLoader] ERROR installing '${extension.name}': ${installError?.message || installError}`,
              );
            }
          }
        }
      }
    } catch (error) {
      logger.error('Failed to load extensions for connection:', error);
    }
  }
}
