/*
 * This file contains code from Outerbase Studio (https://github.com/outerbase/studio)
 * Copyright (C) [2025] Outerbase
 * Licensed under GNU AGPL v3.0
 */
import { syntaxTree } from '@codemirror/language';
import { SyntaxNode } from '@lezer/common';
import { EditorState } from '@uiw/react-codemirror';

import { isEndStatement, isRequireEndStatement } from './helpers';
import { StatementSegment } from './models';

export function splitSqlQuery(
  state: EditorState,
  generateText: boolean = true,
): StatementSegment[] {
  const { topNode } = syntaxTree(state);
  let needEndStatementCounter = 0;
  const statements = topNode.getChildren('Statement');
  if (statements.length === 0) return [];
  const statementGroups: SyntaxNode[][] = [];
  let accumulateNodes: SyntaxNode[] = [];

  for (let i = 0; i < statements.length; i += 1) {
    const statement = statements[i];
    needEndStatementCounter += isRequireEndStatement(state, statement);
    if (needEndStatementCounter) {
      accumulateNodes.push(statement);
    } else {
      statementGroups.push([statement]);
    }
    if (needEndStatementCounter && isEndStatement(state, statement)) {
      needEndStatementCounter -= 1;
      if (needEndStatementCounter === 0) {
        statementGroups.push(accumulateNodes);
        accumulateNodes = [];
      }
    }
  }

  if (accumulateNodes.length > 0) {
    statementGroups.push(accumulateNodes);
  }

  return statementGroups.map((r) => ({
    from: r[0].from,
    to: r[r.length - 1].to,
    text: generateText ? state.doc.sliceString(r[0].from, r[r.length - 1].to) : '',
  }));
}

export function resolveToNearestStatement(state: EditorState) {
  const cursor = state.selection.main.from;
  const statements = splitSqlQuery(state, false);
  if (statements.length === 0) return null;

  for (let i = 0; i < statements.length; i += 1) {
    const statement = statements[i];
    if (cursor < statement.from) {
      if (i === 0) return statements[0];
      const cursorLine = state.doc.lineAt(cursor).number;
      const topLine = state.doc.lineAt(statements[i - 1].to).number;
      const bottomLine = state.doc.lineAt(statements[i].from).number;
      return cursorLine - topLine >= bottomLine - cursorLine ? statements[i] : statements[i - 1];
    }
    if (cursor >= statement.from && cursor <= statement.to) {
      return statement;
    }
  }
  return statements[statements.length - 1];
}

/**
 * Resolves SQL context for AI Assistant, prioritizing selected text over cursor-based statement detection
 * If text is selected, returns the selection; otherwise falls back to nearest statement
 */
export function resolveAIContext(
  state: EditorState,
): { from: number; to: number; text?: string } | null {
  const selection = state.selection.main;

  // If text is selected, use the selection as context
  if (!selection.empty) {
    const selectedText = state.doc.sliceString(selection.from, selection.to);
    return {
      from: selection.from,
      to: selection.to,
      text: selectedText,
    };
  }

  // Get the current line as a fallback
  const cursorLine = state.doc.lineAt(selection.from);
  const currentLineText = cursorLine.text.trim();

  // Try to get the nearest statement
  const nearestStatement = resolveToNearestStatement(state);

  if (!nearestStatement) {
    // If no statement found, use the current line
    if (currentLineText) {
      return {
        from: cursorLine.from,
        to: cursorLine.to,
        text: currentLineText,
      };
    }
    return null;
  }

  const statementText = state.doc.sliceString(nearestStatement.from, nearestStatement.to);

  return {
    from: nearestStatement.from,
    to: nearestStatement.to,
    text: statementText,
  };
}
