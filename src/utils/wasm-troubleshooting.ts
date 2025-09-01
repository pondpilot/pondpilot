/**
 * WASM Troubleshooting Utilities
 *
 * Helper functions to diagnose and fix common WASM issues
 */

/**
 * Check if the current environment has potential WASM issues
 */
export function checkWasmEnvironment(): {
  hasCrossOriginIsolation: boolean;
  hasSharedArrayBuffer: boolean;
  hasFileSystemAccess: boolean;
  memoryLimitations: string[];
  recommendations: string[];
} {
  const checks = {
    hasCrossOriginIsolation: typeof window !== 'undefined' && window.crossOriginIsolated === true,
    hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    hasFileSystemAccess: typeof window !== 'undefined' && 'showOpenFilePicker' in window,
    memoryLimitations: [] as string[],
    recommendations: [] as string[],
  };

  // Check memory limitations
  if (typeof window !== 'undefined' && 'performance' in window && 'memory' in window.performance) {
    const { memory } = window.performance as any;
    if (memory.usedJSHeapSize > memory.totalJSHeapSize * 0.8) {
      checks.memoryLimitations.push('High memory usage detected');
    }
  }

  // Generate recommendations
  if (!checks.hasCrossOriginIsolation) {
    checks.recommendations.push('Enable cross-origin isolation for better performance');
  }

  if (!checks.hasSharedArrayBuffer) {
    checks.recommendations.push('SharedArrayBuffer not available - multithreading disabled');
  }

  if (!checks.hasFileSystemAccess) {
    checks.recommendations.push('File System Access API not available - limited file operations');
  }

  return checks;
}

/**
 * Attempt to recover from file reading errors
 */
export async function attemptFileRecovery(
  engine: any,
  fileName: string,
  originalError: Error,
): Promise<{ recovered: boolean; message: string }> {
  try {
    // Force garbage collection if available
    if (typeof window !== 'undefined' && 'gc' in window) {
      (window as any).gc();
    }

    // Try to flush and reopen the file
    if (engine && engine.db) {
      // Close any existing connections
      const connections = await engine.db.connectionsCount();

      // Try to force a checkpoint
      try {
        const conn = await engine.db.connect();
        await conn.query('CHECKPOINT;');
        await conn.close();
      } catch (checkpointError) {
        console.warn('Checkpoint failed:', checkpointError);
      }
    }

    return {
      recovered: true,
      message: 'Recovery attempt completed - try file operation again',
    };
  } catch (recoveryError) {
    return {
      recovered: false,
      message: `Recovery failed: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`,
    };
  }
}

/**
 * Get file reading recommendations based on file size and type
 */
export function getFileReadingRecommendations(fileSize: number, fileType: string): string[] {
  const recommendations: string[] = [];

  const MB = 1024 * 1024;
  const GB = 1024 * MB;

  if (fileSize > 2 * GB) {
    recommendations.push('File exceeds 2GB browser limit - use desktop app for better performance');
  } else if (fileSize > 500 * MB) {
    recommendations.push(
      'Large file detected - consider using the desktop app for better performance',
    );
    recommendations.push('Ensure sufficient memory is available');
  } else if (fileSize > 100 * MB) {
    recommendations.push('Medium-large file - monitor memory usage during processing');
  }

  if (fileType === 'parquet') {
    recommendations.push('Parquet files require column metadata reading - this may take time');
  }

  if (fileType === 'xlsx') {
    recommendations.push(
      'Excel files are converted to CSV internally - this may take time for large files',
    );
  }

  return recommendations;
}

/**
 * Enhanced error reporting for WASM issues
 */
export function enhanceWasmError(
  originalError: Error,
  context: {
    operation: string;
    fileName?: string;
    fileSize?: number;
  },
): Error {
  const environmentInfo = checkWasmEnvironment();

  let enhancedMessage = `${originalError.message}\n\n`;
  enhancedMessage += `Operation: ${context.operation}\n`;

  if (context.fileName) {
    enhancedMessage += `File: ${context.fileName}\n`;
  }

  if (context.fileSize) {
    enhancedMessage += `File size: ${(context.fileSize / (1024 * 1024)).toFixed(2)} MB\n`;
  }

  enhancedMessage += '\nEnvironment:\n';
  enhancedMessage += `- Cross-origin isolation: ${environmentInfo.hasCrossOriginIsolation}\n`;
  enhancedMessage += `- SharedArrayBuffer: ${environmentInfo.hasSharedArrayBuffer}\n`;
  enhancedMessage += `- File System Access: ${environmentInfo.hasFileSystemAccess}\n`;

  if (environmentInfo.memoryLimitations.length > 0) {
    enhancedMessage += '\nMemory Issues:\n';
    environmentInfo.memoryLimitations.forEach((limitation) => {
      enhancedMessage += `- ${limitation}\n`;
    });
  }

  if (environmentInfo.recommendations.length > 0) {
    enhancedMessage += '\nRecommendations:\n';
    environmentInfo.recommendations.forEach((rec) => {
      enhancedMessage += `- ${rec}\n`;
    });
  }

  // Check if this looks like the specific metadata reading error
  if (
    originalError.message.includes('Expected to read') &&
    originalError.message.includes('metadata bytes')
  ) {
    enhancedMessage += '\nThis appears to be a file metadata reading issue. Try:\n';
    enhancedMessage += '- Refreshing the page and trying again\n';
    enhancedMessage += '- Using a smaller file to test\n';
    enhancedMessage += '- Using the desktop app for more reliable file handling\n';
  }

  const enhancedError = new Error(enhancedMessage);
  enhancedError.name = `Enhanced${originalError.name}`;
  enhancedError.stack = originalError.stack;

  return enhancedError;
}
