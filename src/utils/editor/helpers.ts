/*
 * This file contains code from Outerbase Studio (https://github.com/outerbase/studio)
 * Copyright (C) [2025] Outerbase
 * Licensed under GNU AGPL v3.0
 */
import { SyntaxNode } from '@lezer/common';
import { EditorState } from '@uiw/react-codemirror';

export function toNodeString(state: EditorState, node: SyntaxNode) {
  return state.doc.sliceString(node.from, node.to);
}

export function isRequireEndStatement(state: EditorState, node: SyntaxNode): number {
  const ptr = node.firstChild;
  if (!ptr) return 0;
  const firstKeyword = toNodeString(state, ptr).toLowerCase();
  if (firstKeyword === 'select') return 0;
  if (firstKeyword === 'insert') return 0;
  if (firstKeyword === 'update') return 0;
  if (firstKeyword === 'delete') return 0;
  const keywords = node.getChildren('Keyword');
  if (keywords.length === 0) return 0;
  return keywords.filter((k) => toNodeString(state, k).toLowerCase() === 'begin').length;
}

export function isEndStatement(state: EditorState, node: SyntaxNode) {
  let ptr = node.firstChild;
  if (!ptr) return false;
  if (toNodeString(state, ptr).toLowerCase() !== 'end') return false;
  ptr = ptr.nextSibling;
  if (!ptr) return false;
  if (toNodeString(state, ptr) !== ';') return false;
  return true;
}
