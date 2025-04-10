/*
 * This file contains code from Outerbase Studio (https://github.com/outerbase/studio)
 * Copyright (C) [2025] Outerbase
 * Licensed under GNU AGPL v3.0
 */
import { Decoration, EditorState, EditorView, StateField, Range } from '@uiw/react-codemirror';

import { resolveToNearestStatement } from './statement-parser';

const statementLineHighlight = Decoration.line({
  class: 'cm-highlight-statement',
});

function getDecorationFromState(state: EditorState) {
  const statement = resolveToNearestStatement(state);
  if (!statement) return Decoration.none;

  const fromLineNumber = state.doc.lineAt(statement.from).number;
  const toLineNumber = state.doc.lineAt(statement.to).number;
  const decorations: Range<Decoration>[] = [];

  for (let i = fromLineNumber; i <= toLineNumber; i += 1) {
    decorations.push(statementLineHighlight.range(state.doc.line(i).from));
  }

  return Decoration.set(decorations);
}

const SqlStatementStateField = StateField.define({
  create(state) {
    return getDecorationFromState(state);
  },
  update(_, tr) {
    return getDecorationFromState(tr.state);
  },
  provide: (f) => EditorView.decorations.from(f),
});

const SqlStatementTheme = EditorView.baseTheme({
  '.cm-highlight-statement': {
    borderLeft: '3px solid #ff9ff3 !important',
  },
});

export const SqlStatementHighlightPlugin = [SqlStatementStateField, SqlStatementTheme];
