/*
 * This file contains code from Outerbase Studio (https://github.com/outerbase/studio)
 * Copyright (C) [2025] Outerbase
 * Licensed under GNU AGPL v3.0
 */
import { splitSQLByStats } from './sql';

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

export async function resolveToNearestStatement(
  sql: string,
  cursorOffset: number,
): Promise<StatementSegment | null> {
  const statements = await splitSqlQuery(sql, false);
  if (statements.length === 0) return null;

  for (let i = 0; i < statements.length; i += 1) {
    const statement = statements[i];
    if (cursorOffset < statement.from) {
      if (i === 0) return statements[0];
      return statements[i - 1];
    }
    if (cursorOffset >= statement.from && cursorOffset <= statement.to) {
      return statement;
    }
  }
  return statements[statements.length - 1];
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

  const nearestStatement = await resolveToNearestStatement(sql, selection.from);
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
