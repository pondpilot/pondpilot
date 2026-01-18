/**
 * Utilities for converting between UTF-8 byte offsets and JavaScript string indices.
 *
 * JavaScript strings use UTF-16 encoding internally, but many parsers (including
 * FlowScope) return offsets in UTF-8 bytes. These utilities efficiently convert
 * between the two representations.
 *
 * ## Offset Semantics
 *
 * - **UTF-8 byte offset**: Number of bytes from the start of the UTF-8 encoded string
 * - **UTF-16 code unit offset**: JavaScript string index (char position)
 * - **Code point**: A single Unicode character (may be 1-4 bytes in UTF-8, 1-2 code units in UTF-16)
 *
 * ## Span Semantics
 *
 * All spans in this module use half-open intervals: [start, end)
 * - `start` is inclusive (the first byte/character of the span)
 * - `end` is exclusive (the byte/character immediately after the span)
 *
 * Example: For text "SELECT * FROM t", a span {start: 0, end: 6} represents "SELECT"
 *
 * ## Surrogate Pair Handling
 *
 * Astral plane characters (emoji, rare CJK, etc.) are:
 * - 4 bytes in UTF-8
 * - 2 code units (surrogate pair) in UTF-16
 *
 * The conversion functions handle this correctly by using `for...of` to iterate
 * code points while tracking UTF-16 code units via `char.length`.
 */

/**
 * Represents a byte offset range (start inclusive, end exclusive).
 * This is a half-open interval: [start, end)
 */
export interface ByteSpan {
  start: number;
  end: number;
}

/**
 * Calculates the UTF-8 byte length of a single character (code point).
 * This is more efficient than using TextEncoder for single characters
 * as it avoids allocating a new Uint8Array on each call.
 *
 * @param char - A single character (may be 1 or 2 UTF-16 code units for surrogate pairs)
 * @returns The number of bytes needed to encode this character in UTF-8
 */
export function getUtf8ByteLength(char: string): number {
  const code = char.codePointAt(0);
  if (code === undefined) return 0;
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  if (code < 0x10000) return 3;
  return 4;
}

/**
 * Builds a map from UTF-8 byte offsets to JavaScript string indices (UTF-16).
 * Uses a single pass through the text for efficiency.
 *
 * @param text - The source text
 * @param byteOffsets - Array of byte offsets to map (will be sorted internally)
 * @returns A Map from byte offset to character index
 */
export function buildByteToCharMap(text: string, byteOffsets: number[]): Map<number, number> {
  if (byteOffsets.length === 0) {
    return new Map();
  }

  const sortedOffsets = [...byteOffsets].sort((a, b) => a - b);
  const byteToCharMap = new Map<number, number>();

  let bytePos = 0;
  let charPos = 0;
  let offsetIndex = 0;

  for (const char of text) {
    // Record any offsets we've reached
    while (offsetIndex < sortedOffsets.length && bytePos >= sortedOffsets[offsetIndex]) {
      byteToCharMap.set(sortedOffsets[offsetIndex], charPos);
      offsetIndex++;
    }
    if (offsetIndex >= sortedOffsets.length) break;

    bytePos += getUtf8ByteLength(char);
    // char.length is 1 for BMP characters, 2 for astral plane (surrogate pairs)
    charPos += char.length;
  }

  // Handle any remaining offsets at or after end of text
  while (offsetIndex < sortedOffsets.length) {
    byteToCharMap.set(sortedOffsets[offsetIndex], text.length);
    offsetIndex++;
  }

  return byteToCharMap;
}

/**
 * Converts byte spans to character index spans in a single pass.
 * More efficient than calling fromUtf8Offset repeatedly.
 *
 * @param text - The source text
 * @param spans - Array of byte spans to convert
 * @returns Array of character index spans in the same order as input
 */
export function mapSpansByteToChar(
  text: string,
  spans: ByteSpan[],
): { start: number; end: number }[] {
  if (spans.length === 0) {
    return [];
  }

  // Collect unique byte offsets
  const byteOffsets = new Set<number>();
  for (const span of spans) {
    byteOffsets.add(span.start);
    byteOffsets.add(span.end);
  }

  const byteToCharMap = buildByteToCharMap(text, Array.from(byteOffsets));

  return spans.map((span) => ({
    start: byteToCharMap.get(span.start) ?? 0,
    end: byteToCharMap.get(span.end) ?? text.length,
  }));
}

/**
 * Creates an offset converter for a specific text string.
 * Pre-computes byte positions in a single pass, enabling O(1) lookups for
 * repeated conversions. Useful when multiple conversions are needed but
 * offsets aren't known upfront (e.g., iterating analysis results).
 *
 * @param text - The source text to convert offsets for
 * @returns Converter with fromUtf8 and toUtf8 methods
 */
export function createOffsetConverter(text: string): {
  fromUtf8: (byteOffset: number) => number;
  toUtf8: (charOffset: number) => number;
} {
  // Build a full byte-to-char mapping in one pass
  const byteToChar: number[] = [];
  const charToByte: number[] = [];
  let bytePos = 0;
  let charPos = 0;

  for (const char of text) {
    const charBytes = getUtf8ByteLength(char);

    // Map each byte position to its char position
    for (let i = 0; i < charBytes; i++) {
      byteToChar[bytePos + i] = charPos;
    }

    // Map each char position to its byte position
    for (let i = 0; i < char.length; i++) {
      charToByte[charPos + i] = bytePos;
    }

    bytePos += charBytes;
    charPos += char.length;
  }

  // Handle end positions
  byteToChar[bytePos] = text.length;
  charToByte[text.length] = bytePos;

  return {
    fromUtf8: (byteOffset: number): number => {
      if (byteOffset < 0) return 0;
      if (byteOffset >= byteToChar.length) return text.length;
      return byteToChar[byteOffset];
    },
    toUtf8: (charOffset: number): number => {
      if (charOffset < 0) return 0;
      if (charOffset >= charToByte.length) return bytePos;
      return charToByte[charOffset];
    },
  };
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
      posIndex++;
    }
    if (charIndex < text.length && text[charIndex] === '\n') {
      line++;
    }
    charIndex++;
  }

  return charToLineMap;
}
