import { DatabaseEngineError } from '@engines/errors';

const FALLBACK_MESSAGE = 'An unexpected error occurred';

function tryParseStructuredMessage(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      const { details } = (parsed as any);
      if (details && typeof details === 'object') {
        if (typeof details.message === 'string') {
          return details.message;
        }
      }
      if (typeof (parsed as any).message === 'string') {
        return (parsed as any).message;
      }
      if (typeof (parsed as any).error === 'string') {
        return (parsed as any).error;
      }
    }
  } catch {
    // Ignore JSON parse errors – we'll fall back to the raw string
  }

  return null;
}

function extractMessage(value: unknown, depth = 0): string | null {
  if (depth > 5 || value === null || value === undefined) {
    return null;
  }

  if (value instanceof DatabaseEngineError) {
    const nested = extractMessage(value.details?.originalError, depth + 1);
    if (nested) {
      return nested;
    }
  }

  if (value instanceof Error) {
    const parsed = tryParseStructuredMessage(value.message);
    const baseMessage = parsed ?? value.message.trim();
    if (baseMessage && baseMessage !== '[object Object]') {
      return baseMessage;
    }
    const causeMessage = extractMessage((value as any).cause, depth + 1);
    if (causeMessage) {
      return causeMessage;
    }
  }

  if (typeof value === 'string') {
    const parsed = tryParseStructuredMessage(value);
    const trimmed = parsed ?? value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const nested = extractMessage(entry, depth + 1);
      if (nested) {
        return nested;
      }
    }
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keysToCheck = ['message', 'error', 'details', 'reason', 'cause', 'body'];
    for (const key of keysToCheck) {
      if (obj && key in obj) {
        const nested = extractMessage(obj[key], depth + 1);
        if (nested) {
          return nested;
        }
      }
    }

    try {
      const json = JSON.stringify(value);
      if (json && json !== '{}') {
        return json;
      }
    } catch {
      // Ignore serialization errors
    }
    return Object.prototype.toString.call(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return null;
}

export function normalizeErrorMessage(error: unknown): string {
  const message = extractMessage(error);
  return message && message.length > 0 ? message : FALLBACK_MESSAGE;
}
