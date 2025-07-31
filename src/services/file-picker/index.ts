/**
 * Platform-agnostic file picker service
 *
 * Automatically selects the appropriate implementation based on the environment:
 * - Tauri: Uses native file dialogs
 * - Web: Uses File System Access API with fallback to input elements
 */

// Main API
import { FilePickerFactory } from './file-picker-factory';

export * from './types';
export * from './file-picker-factory';
export * from './web-file-picker';
export * from './tauri-file-picker';
export { FilePickerFactory as FilePicker };

// Convenience function to get the file picker instance
export const getFilePicker = () => FilePickerFactory.getFilePicker();
