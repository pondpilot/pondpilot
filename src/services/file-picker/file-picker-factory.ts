import { isTauriEnvironment } from '@utils/browser';

import { TauriFilePicker } from './tauri-file-picker';
import { IFilePicker } from './types';
import { WebFilePicker } from './web-file-picker';

/**
 * Factory for creating platform-appropriate file picker
 */
export class FilePickerFactory {
  private static instance: IFilePicker | null = null;

  /**
   * Get the appropriate file picker for the current environment
   */
  static getFilePicker(): IFilePicker {
    if (!this.instance) {
      // console.log('FilePickerFactory: Creating new file picker instance');
      // console.log('FilePickerFactory: Platform detected:', this.getPlatform());
      this.instance = this.createFilePicker();
    }
    return this.instance;
  }

  /**
   * Create a new file picker instance (useful for testing or forcing recreation)
   */
  static createFilePicker(): IFilePicker {
    if (isTauriEnvironment()) {
      return new TauriFilePicker();
    }
    return new WebFilePicker();
  }

  /**
   * Reset the singleton instance (useful for testing)
   */
  static reset(): void {
    this.instance = null;
  }

  /**
   * Check what platform we're running on
   */
  static getPlatform(): 'web' | 'tauri' {
    return isTauriEnvironment() ? 'tauri' : 'web';
  }
}
