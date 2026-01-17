/*
 * This file contains code from Outerbase Studio (https://github.com/outerbase/studio)
 * Copyright (C) [2025] Outerbase
 * Licensed under GNU AGPL v3.0
 */
import { splitSQLByStats, toUtf8Offset, fromUtf8Offset } from './sql';
import { getFlowScopeClient } from '../../workers/flowscope-client';

export interface StatementSegment {
  from: number;
  to: number;
  text: string;
}

export async function splitSqlQuery(
  sql: string,
  generateText: boolean = true,
): Promise<StatementSegment[]> {
  const statements = await splitSQLByStats(sql);
  if (statements.length === 0) return [];

  return statements.map((statement) => ({
    from: statement.start,
    to: statement.end,
    text: generateText ? statement.code : '',
  }));
}

/**
 * Finds the statement containing the cursor using raw byte offsets from the worker.
 * This is more efficient than splitSqlQuery because it:
 * 1. Only converts the cursor position to UTF-8 once
 * 2. Only converts back to UTF-16 for the ONE matching statement
 * 3. Doesn't compute line numbers or extract code for all statements
 */
export async function resolveToNearestStatement(
  sql: string,
  cursorOffset: number,
): Promise<StatementSegment | null> {
  if (!sql.trim()) return null;

  // Get raw byte offsets from worker (no post-processing)
  const client = getFlowScopeClient();
  const result = await client.split(sql);

  if (!result.statements.length) return null;

  // Convert cursor position to UTF-8 byte offset once
  const cursorByteOffset = toUtf8Offset(sql, cursorOffset);

  // Find the statement containing the cursor using byte offsets
  let matchingStatement: { start: number; end: number } | null = null;

  for (let i = 0; i < result.statements.length; i += 1) {
    const stmt = result.statements[i];
    if (cursorByteOffset < stmt.start) {
      // Cursor is before this statement
      matchingStatement = i === 0 ? result.statements[0] : result.statements[i - 1];
      break;
    }
    if (cursorByteOffset >= stmt.start && cursorByteOffset <= stmt.end) {
      // Cursor is inside this statement
      matchingStatement = stmt;
      break;
    }
  }

  // If cursor is after all statements, use the last one
  if (!matchingStatement) {
    matchingStatement = result.statements[result.statements.length - 1];
  }

  // Only convert the ONE matching statement to UTF-16 offsets
  const from = fromUtf8Offset(sql, matchingStatement.start);
  const to = fromUtf8Offset(sql, matchingStatement.end);

  return { from, to, text: '' };
}

/**
 * Resolves SQL context for AI Assistant, prioritizing selected text over cursor-based statement detection
 * If text is selected, returns the selection; otherwise falls back to nearest statement
 */
export async function resolveAIContext(
  sql: string,
  selection: { from: number; to: number },
): Promise<{ from: number; to: number; text?: string } | null> {
  // If text is selected, use the selection as context
  if (selection.from !== selection.to) {
    const selectedText = sql.slice(selection.from, selection.to);
    return {
      from: selection.from,
      to: selection.to,
      text: selectedText,
    };
  }

  let nearestStatement: StatementSegment | null;
  try {
    nearestStatement = await resolveToNearestStatement(sql, selection.from);
  } catch (error) {
    console.error('AI Assistant: Failed to resolve nearest statement:', error);
    nearestStatement = null;
  }
  if (!nearestStatement) {
    const currentLineStart = sql.lastIndexOf('\n', selection.from - 1) + 1;
    const currentLineEnd = sql.indexOf('\n', selection.from);
    const end = currentLineEnd === -1 ? sql.length : currentLineEnd;
    const lineText = sql.slice(currentLineStart, end).trim();
    if (lineText) {
      return {
        from: currentLineStart,
        to: end,
        text: lineText,
      };
    }
    return null;
  }

  return {
    from: nearestStatement.from,
    to: nearestStatement.to,
    text: sql.slice(nearestStatement.from, nearestStatement.to),
  };
}
