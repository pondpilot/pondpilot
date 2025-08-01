/**
 * Debug logger for database engine operations
 * Can be toggled on/off and filtered by level
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
}

export interface LoggerConfig {
  enabled: boolean;
  level: LogLevel;
  prefix?: string;
  includeTimestamp?: boolean;
  customOutput?: (message: string, level: LogLevel, context?: any) => void;
}

const DEFAULT_CONFIG: LoggerConfig = {
  enabled: false,
  level: LogLevel.INFO,
  includeTimestamp: true,
};

class DebugLogger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  error(message: string, error?: any, context?: any): void {
    this.log(LogLevel.ERROR, message, { error, ...context });
  }

  warn(message: string, context?: any): void {
    this.log(LogLevel.WARN, message, context);
  }

  info(message: string, context?: any): void {
    this.log(LogLevel.INFO, message, context);
  }

  debug(message: string, context?: any): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  trace(message: string, context?: any): void {
    this.log(LogLevel.TRACE, message, context);
  }

  private log(level: LogLevel, message: string, context?: any): void {
    if (!this.config.enabled || level > this.config.level) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message);

    if (this.config.customOutput) {
      this.config.customOutput(formattedMessage, level, context);
    } else {
      this.defaultOutput(level, formattedMessage, context);
    }
  }

  private formatMessage(level: LogLevel, message: string): string {
    const parts: string[] = [];

    if (this.config.includeTimestamp) {
      parts.push(`[${new Date().toISOString()}]`);
    }

    parts.push(`[${LogLevel[level]}]`);

    if (this.config.prefix) {
      parts.push(`[${this.config.prefix}]`);
    }

    parts.push(message);

    return parts.join(' ');
  }

  private defaultOutput(level: LogLevel, message: string, context?: any): void {
    const hasContext = context && Object.keys(context).length > 0;

    switch (level) {
      case LogLevel.ERROR:
        if (hasContext) {
          console.error(message, context);
        } else {
          console.error(message);
        }
        break;
      case LogLevel.WARN:
        if (hasContext) {
          console.warn(message, context);
        } else {
          console.warn(message);
        }
        break;
      default:
        if (hasContext) {
          console.log(message, context);
        } else {
          console.log(message);
        }
        break;
    }
  }
}

// Create logger instances for different components
export function createDebugLogger(namespace: string): DebugLogger {
  const config: Partial<LoggerConfig> = {
    prefix: namespace,
    enabled: getDebugEnabled(namespace),
    level: getDebugLevel(),
  };

  return new DebugLogger(config);
}

// Check if debug is enabled for a specific namespace
function getDebugEnabled(namespace: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Check localStorage for debug settings
  try {
    const debugSetting = localStorage.getItem('PONDPILOT_DEBUG');
    if (!debugSetting) {
      return false;
    }

    // Support wildcards
    if (debugSetting === '*' || debugSetting === 'true') {
      return true;
    }

    // Support comma-separated namespaces
    const enabledNamespaces = debugSetting.split(',').map((s) => s.trim());
    return enabledNamespaces.some((pattern) => {
      if (pattern.endsWith('*')) {
        return namespace.startsWith(pattern.slice(0, -1));
      }
      return namespace === pattern;
    });
  } catch {
    return false;
  }
}

// Get debug level from environment
function getDebugLevel(): LogLevel {
  if (typeof window === 'undefined') {
    return LogLevel.INFO;
  }

  try {
    const levelStr = localStorage.getItem('PONDPILOT_DEBUG_LEVEL');
    if (levelStr && levelStr in LogLevel) {
      return LogLevel[levelStr as keyof typeof LogLevel] as unknown as LogLevel;
    }
  } catch {
    // Ignore
  }

  return LogLevel.INFO;
}

// Global logger registry
const loggers = new Map<string, DebugLogger>();

// Get or create a logger for a namespace
export function getLogger(namespace: string): DebugLogger {
  if (!loggers.has(namespace)) {
    loggers.set(namespace, createDebugLogger(namespace));
  }
  return loggers.get(namespace)!;
}

// Enable/disable all loggers
export function setGlobalDebugEnabled(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('PONDPILOT_DEBUG', enabled ? '*' : '');
  }

  // Update existing loggers
  loggers.forEach((logger) => logger.setEnabled(enabled));
}

// Set global debug level
export function setGlobalDebugLevel(level: LogLevel): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('PONDPILOT_DEBUG_LEVEL', LogLevel[level]);
  }

  // Update existing loggers
  loggers.forEach((logger) => logger.setLevel(level));
}
