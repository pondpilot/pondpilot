import { CellId, NotebookCell } from '@models/notebook';
import { ParsedStatement, splitSQLByStats } from '@utils/editor/sql';
import { ensureCellRef } from '@utils/notebook';

import { normalizeCellName } from './cell-naming';

export type NotebookAliasRefactorPatch = {
  cellId: CellId;
  oldContent: string;
  newContent: string;
  replacements: number;
};

export type NotebookAliasRefactorPreview = {
  oldName: string | null;
  nextName: string | null;
  replacementName: string | null;
  patches: NotebookAliasRefactorPatch[];
  parserFallbackCount: number;
};

type RewriteResult = {
  content: string;
  replacements: number;
  parserFallbackUsed: boolean;
};

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_]/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_]/.test(char);
}

function escapeQuotedIdentifier(identifier: string): string {
  return identifier.replace(/"/g, '""');
}

function replaceIdentifiersInChunk(
  chunk: string,
  oldName: string,
  replacementName: string,
): { content: string; replacements: number } {
  let result = '';
  let replacements = 0;
  let index = 0;

  const oldNameLower = oldName.toLowerCase();

  while (index < chunk.length) {
    const char = chunk[index];
    const nextChar = chunk[index + 1];

    // Single-line comments
    if (char === '-' && nextChar === '-') {
      const lineEnd = chunk.indexOf('\n', index);
      if (lineEnd === -1) {
        result += chunk.slice(index);
        break;
      }
      result += chunk.slice(index, lineEnd + 1);
      index = lineEnd + 1;
      continue;
    }

    // Block comments
    if (char === '/' && nextChar === '*') {
      const commentEnd = chunk.indexOf('*/', index + 2);
      if (commentEnd === -1) {
        result += chunk.slice(index);
        break;
      }
      result += chunk.slice(index, commentEnd + 2);
      index = commentEnd + 2;
      continue;
    }

    // Strings
    if (char === "'") {
      let end = index + 1;
      while (end < chunk.length) {
        if (chunk[end] === "'") {
          if (chunk[end + 1] === "'") {
            end += 2;
            continue;
          }
          end += 1;
          break;
        }
        end += 1;
      }
      result += chunk.slice(index, end);
      index = end;
      continue;
    }

    // Quoted identifiers
    if (char === '"') {
      let end = index + 1;
      let value = '';
      while (end < chunk.length) {
        if (chunk[end] === '"') {
          if (chunk[end + 1] === '"') {
            value += '"';
            end += 2;
            continue;
          }
          break;
        }
        value += chunk[end];
        end += 1;
      }

      if (end < chunk.length && value.toLowerCase() === oldNameLower) {
        result += `"${escapeQuotedIdentifier(replacementName)}"`;
        replacements += 1;
      } else {
        result += chunk.slice(index, Math.min(end + 1, chunk.length));
      }
      index = Math.min(end + 1, chunk.length);
      continue;
    }

    // Unquoted identifiers
    if (isIdentifierStart(char)) {
      let end = index + 1;
      while (end < chunk.length && isIdentifierPart(chunk[end])) {
        end += 1;
      }
      const token = chunk.slice(index, end);
      if (token.toLowerCase() === oldNameLower) {
        result += replacementName;
        replacements += 1;
      } else {
        result += token;
      }
      index = end;
      continue;
    }

    result += char;
    index += 1;
  }

  return { content: result, replacements };
}

function rewriteByStatements(
  sql: string,
  statements: ParsedStatement[],
  oldName: string,
  replacementName: string,
): { content: string; replacements: number } {
  let cursor = 0;
  let content = '';
  let replacements = 0;

  for (const statement of statements) {
    content += sql.slice(cursor, statement.start);
    const rewritten = replaceIdentifiersInChunk(statement.code, oldName, replacementName);
    content += rewritten.content;
    replacements += rewritten.replacements;
    cursor = statement.end;
  }

  content += sql.slice(cursor);
  return { content, replacements };
}

async function rewriteWithParser(
  sql: string,
  oldName: string,
  replacementName: string,
): Promise<RewriteResult> {
  try {
    const statements = await splitSQLByStats(sql);
    if (statements.length === 0) {
      const rewritten = replaceIdentifiersInChunk(sql, oldName, replacementName);
      return {
        content: rewritten.content,
        replacements: rewritten.replacements,
        parserFallbackUsed: false,
      };
    }

    const rewritten = rewriteByStatements(sql, statements, oldName, replacementName);
    return {
      content: rewritten.content,
      replacements: rewritten.replacements,
      parserFallbackUsed: false,
    };
  } catch {
    const rewritten = replaceIdentifiersInChunk(sql, oldName, replacementName);
    return {
      content: rewritten.content,
      replacements: rewritten.replacements,
      parserFallbackUsed: true,
    };
  }
}

export async function previewNotebookAliasRenameRefactor(
  sortedCells: NotebookCell[],
  targetCellId: CellId,
  nextName: string | null,
): Promise<NotebookAliasRefactorPreview> {
  const targetCell = sortedCells.find((cell) => cell.id === targetCellId);
  if (!targetCell || targetCell.type !== 'sql') {
    return {
      oldName: null,
      nextName: normalizeCellName(nextName),
      replacementName: null,
      patches: [],
      parserFallbackCount: 0,
    };
  }

  const oldName = normalizeCellName(targetCell.name);
  const normalizedNextName = normalizeCellName(nextName);
  const replacementName = normalizedNextName ?? ensureCellRef(targetCell.id, targetCell.ref);

  if (!oldName || oldName.toLowerCase() === replacementName.toLowerCase()) {
    return {
      oldName,
      nextName: normalizedNextName,
      replacementName,
      patches: [],
      parserFallbackCount: 0,
    };
  }

  const patches: NotebookAliasRefactorPatch[] = [];
  let parserFallbackCount = 0;

  for (const cell of sortedCells) {
    if (cell.id === targetCellId || cell.type !== 'sql') continue;
    if (!cell.content.toLowerCase().includes(oldName.toLowerCase())) continue;

    const rewritten = await rewriteWithParser(cell.content, oldName, replacementName);
    if (rewritten.parserFallbackUsed) {
      parserFallbackCount += 1;
    }
    if (rewritten.replacements <= 0 || rewritten.content === cell.content) continue;

    patches.push({
      cellId: cell.id,
      oldContent: cell.content,
      newContent: rewritten.content,
      replacements: rewritten.replacements,
    });
  }

  return {
    oldName,
    nextName: normalizedNextName,
    replacementName,
    patches,
    parserFallbackCount,
  };
}
