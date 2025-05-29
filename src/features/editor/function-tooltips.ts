/*
 * This file contains code from Outerbase Studio (https://github.com/outerbase/studio)
 * Copyright (C) [2025] Outerbase
 * Licensed under GNU AGPL v3.0
 */
import { syntaxTree } from '@codemirror/language';
import { StateField, EditorState } from '@codemirror/state';
import { Tooltip, showTooltip, EditorView } from '@codemirror/view';

export type TooltipDict = Record<string, { syntax: string; description: string; example?: string }>;

function getCursorTooltips(state: EditorState, dict: TooltipDict): readonly Tooltip[] {
  const tree = syntaxTree(state);
  const pos = state.selection.main.head;
  const node = tree.resolveInner(state.selection.main.head, -1);

  const { parent } = node;
  if (!parent) return [];

  if (parent.type.name !== 'Parens') return [];

  if (!parent.prevSibling) return [];
  if (!['Keyword', 'Type', 'Identifier'].includes(parent.prevSibling.type.name)) return [];

  const keywordString = state.doc
    .slice(parent.prevSibling.from, parent.prevSibling.to)
    .toString()
    .toLowerCase();

  const dictItem = dict[keywordString];

  if (dictItem) {
    return [
      {
        pos,
        above: true,
        arrow: true,
        create: () => {
          const dom = document.createElement('div');
          dom.className = 'cm-tooltip-cursor';
          dom.innerHTML = `
            <div style="max-width:700px; padding:5px; font-size:14px;">
              <p style='font-size:16px; opacity: 0.6;'><strong>${dictItem.syntax}</strong></p>
              ${dictItem.description ? `<div class="code-tooltip">${dictItem.description}</div>` : ''}
              ${dictItem.example ? `<div style="margin-top:8px;"><strong>Example:</strong><br><code style="padding:4px 0; border-radius:3px; font-family:monospace;">${dictItem.example}</code></div>` : ''}
            </div>
          `;
          return { dom };
        },
      },
    ];
  }

  return [];
}

// eslint-disable-next-line arrow-body-style
const functionTooltipField = (dict: TooltipDict) => {
  return StateField.define<readonly Tooltip[]>({
    create(state) {
      return getCursorTooltips(state, dict);
    },

    update(tooltips, tr) {
      if (!tr.docChanged && !tr.selection) return tooltips;
      return getCursorTooltips(tr.state, dict);
    },

    provide: (f) => showTooltip.computeN([f], (state) => state.field(f)),
  });
};
const functionTooltipBaseTheme = EditorView.baseTheme({
  '.cm-tooltip-arrow': {
    display: 'none',
  },

  '.code-tooltip a': {
    '[data-mantine-color-scheme="light"] &': {
      color: '#242B35',
    },
    '[data-mantine-color-scheme="dark"] &': {
      color: 'white',
    },
    textDecoration: 'underline',
  },
  '.code-tooltip a:hover': {
    textDecoration: 'none',
  },
});

export function functionTooltip(dict: TooltipDict) {
  return [functionTooltipField(dict), functionTooltipBaseTheme];
}
