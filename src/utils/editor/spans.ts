/**
 * Utilities for UTF-16 span handling and line number mapping.
 *
 * ## UTF-16 Encoding
 *
 * FlowScope returns spans in UTF-16 code units when `encoding: 'utf16'` is specified.
 * UTF-16 offsets match JavaScript string indices and Monaco editor offsets directly,
 * eliminating the need for conversion. This is configured in flowscope-worker.ts.
 *
 * ## Span Semantics
 *
 * All spans use half-open intervals: [start, end)
 * - `start` is inclusive (the first character of the span)
 * - `end` is exclusive (the character immediately after the span)
 *
 * Example: For text "SELECT * FROM t", a span {start: 0, end: 6} represents "SELECT"
 */

/**
 * A span with UTF-16 offsets (JavaScript string indices).
 * Used for FlowScope results when encoding='utf16' is specified.
 */
export type Utf16Span = {
  start: number;
  end: number;
};

/**
 * Safely extracts a substring using span offsets with bounds checking.
 * Returns null if span is invalid, allowing callers to handle the error appropriately.
 *
 * @param text - The source text
 * @param span - The span with start/end offsets
 * @param context - Optional context for warning messages (e.g., 'CTE definition')
 * @returns The extracted substring, or null if span is invalid
 */
export function safeSliceBySpan(text: string, span: Utf16Span, context?: string): string | null {
  const { start, end } = span;

  if (start < 0 || end > text.length || start > end) {
    const ctx = context ? ` (${context})` : '';
    console.warn(`Invalid span${ctx}: start=${start}, end=${end}, textLength=${text.length}`);
    return null;
  }

  return text.slice(start, end);
}

/**
 * Validates that a span is within bounds of the text.
 *
 * @param text - The source text
 * @param span - The span to validate
 * @returns true if the span is valid, false otherwise
 */
export function isSpanValid(text: string, span: Utf16Span): boolean {
  return span.start >= 0 && span.end <= text.length && span.start <= span.end;
}

/**
 * Builds a map from character indices to line numbers in a single pass.
 *
 * @param text - The source text
 * @param charPositions - Array of character positions to map
 * @returns A Map from character index to 1-based line number
 */
export function buildCharToLineMap(text: string, charPositions: number[]): Map<number, number> {
  if (charPositions.length === 0) {
    return new Map();
  }

  const sortedPositions = [...charPositions].sort((a, b) => a - b);
  const charToLineMap = new Map<number, number>();

  let line = 1;
  let charIndex = 0;
  let posIndex = 0;

  while (posIndex < sortedPositions.length && charIndex <= text.length) {
    if (charIndex === sortedPositions[posIndex]) {
      charToLineMap.set(charIndex, line);
      posIndex += 1;
    }
    if (charIndex < text.length && text[charIndex] === '\n') {
      line += 1;
    }
    charIndex += 1;
  }

  return charToLineMap;
}
