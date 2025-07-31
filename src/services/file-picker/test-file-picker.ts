/**
 * Test file to verify the file picker implementation works correctly
 * This can be used for development testing and debugging
 */

import { getFilePicker, FilePickerFactory } from './index';

/**
 * Test the file picker functionality
 */
export async function testFilePicker() {
  console.log('Testing file picker implementation...');

  const picker = getFilePicker();

  console.log('Platform:', FilePickerFactory.getPlatform());
  console.log('Supports:', picker.supports);

  try {
    // Test file picking (this will open a dialog)
    console.log('Testing file picker...');
    const result = await picker.pickFiles({
      accept: ['.txt', '.csv', '.json'],
      description: 'Test Files',
      multiple: true,
    });

    if (result.error) {
      console.error('File picker error:', result.error);
    } else if (result.cancelled) {
      console.log('File picker cancelled');
    } else {
      console.log('Selected files:', result.files);
    }
  } catch (error) {
    console.error('File picker test error:', error);
  }
}

// Export for use in browser console during development
if (typeof window !== 'undefined') {
  (window as any).testFilePicker = testFilePicker;
}
