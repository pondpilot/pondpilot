/**
 * Unified file system service that automatically selects the appropriate adapter
 */

import { ChromeFileSystemAdapter } from './chrome-adapter';
import { FallbackFileSystemAdapter } from './fallback-adapter';
import {
  FileSystemAdapter,
  FilePickerOptions,
  DirectoryPickerOptions,
  FileHandle,
  DirectoryHandle,
  BrowserInfo,
  BrowserCapabilities,
  FilePickerResult,
  DirectoryPickerResult,
} from './models';

class FileSystemService implements FileSystemAdapter {
  private adapter: FileSystemAdapter;
  private static instance: FileSystemService;

  private constructor() {
    // Detect browser capabilities and select appropriate adapter
    if (this.hasFileSystemAccessAPI()) {
      this.adapter = new ChromeFileSystemAdapter();
    } else {
      this.adapter = new FallbackFileSystemAdapter();
    }
  }

  static getInstance(): FileSystemService {
    if (!FileSystemService.instance) {
      FileSystemService.instance = new FileSystemService();
    }
    return FileSystemService.instance;
  }

  private hasFileSystemAccessAPI(): boolean {
    return (
      typeof window !== 'undefined' &&
      'showOpenFilePicker' in window &&
      'showDirectoryPicker' in window &&
      'showSaveFilePicker' in window
    );
  }

  // Delegate all methods to the selected adapter
  getBrowserInfo(): BrowserInfo {
    return this.adapter.getBrowserInfo();
  }

  getBrowserCapabilities(): BrowserCapabilities {
    return this.adapter.getBrowserCapabilities();
  }

  canPersistHandles(): boolean {
    return this.adapter.canPersistHandles();
  }

  canAccessDirectories(): boolean {
    return this.adapter.canAccessDirectories();
  }

  canWriteBack(): boolean {
    return this.adapter.canWriteBack();
  }

  async pickFiles(options?: FilePickerOptions): Promise<FilePickerResult> {
    return this.adapter.pickFiles(options);
  }

  async pickDirectory(options?: DirectoryPickerOptions): Promise<DirectoryPickerResult> {
    return this.adapter.pickDirectory(options);
  }

  // Legacy methods for backward compatibility
  async pickFilesLegacy(options?: FilePickerOptions): Promise<FileHandle[]> {
    return this.adapter.pickFilesLegacy(options);
  }

  async pickDirectoryLegacy(options?: DirectoryPickerOptions): Promise<DirectoryHandle | null> {
    return this.adapter.pickDirectoryLegacy(options);
  }

  async requestPermission(handle: FileHandle | DirectoryHandle): Promise<boolean> {
    return this.adapter.requestPermission(handle);
  }

  async queryPermission(handle: FileHandle | DirectoryHandle): Promise<PermissionState> {
    return this.adapter.queryPermission(handle);
  }

  // Additional utility methods specific to PondPilot

  /**
   * Show a compatibility warning if using fallback mode
   */
  shouldShowCompatibilityWarning(): boolean {
    const info = this.getBrowserInfo();
    return info.level !== 'full';
  }

  /**
   * Get user-friendly browser recommendations
   */
  getBrowserRecommendations(): string[] {
    const info = this.getBrowserInfo();

    if (info.level === 'full') {
      return [];
    }

    const recommendations = [
      'For the best experience, we recommend using Google Chrome or Microsoft Edge.',
      'These browsers support advanced file system features that enable:',
      '• Direct file access without copying',
      '• Persistent file connections across sessions',
      '• Better performance with large files',
    ];

    if (info.name === 'Firefox') {
      recommendations.push(
        'Firefox is working on implementing these features. They may be available in future versions.',
      );
    } else if (info.name === 'Safari') {
      recommendations.push(
        'Safari has limited support. Consider using Chrome or Edge for full functionality.',
      );
    }

    return recommendations;
  }
}

// Export singleton instance
export const fileSystemService = FileSystemService.getInstance();

// Export types for convenience
export * from './models';
