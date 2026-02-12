import { parseUserCellName } from '@features/notebook/utils/cell-naming';
import { Notebook, NotebookCell } from '@models/notebook';
import { sanitizeFileName } from '@utils/export-data';

/**
 * The `.sqlnb` JSON file format for notebook export/import.
 */
export interface SqlnbFormat {
  version: 1;
  name: string;
  cells: SqlnbCell[];
  metadata: {
    createdAt: string;
    pondpilotVersion: string;
  };
}

interface SqlnbCell {
  type: 'sql' | 'markdown';
  content: string;
  name?: string;
}

const SQLNB_FORMAT_VERSION = 1 as const;

/**
 * Serializes a Notebook into the .sqlnb JSON format.
 */
export function notebookToSqlnb(notebook: Notebook, appVersion: string): SqlnbFormat {
  const sortedCells = [...notebook.cells].sort((a, b) => a.order - b.order);

  return {
    version: SQLNB_FORMAT_VERSION,
    name: notebook.name,
    cells: sortedCells.map((cell) => {
      const sqlnbCell: SqlnbCell = {
        type: cell.type,
        content: cell.content,
      };
      if (cell.type === 'sql') {
        const name = parseUserCellName(cell.content);
        if (name) {
          sqlnbCell.name = name;
        }
      }
      return sqlnbCell;
    }),
    metadata: {
      createdAt: notebook.createdAt,
      pondpilotVersion: appVersion,
    },
  };
}

/**
 * Validates and parses a JSON string as a .sqlnb notebook.
 * Returns the parsed format or throws a descriptive error.
 */
export function parseSqlnb(jsonString: string): SqlnbFormat {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('Invalid JSON: the file does not contain valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid .sqlnb format: root must be a JSON object.');
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.version !== SQLNB_FORMAT_VERSION) {
    throw new Error(
      `Unsupported .sqlnb version: ${String(obj.version)}. Expected ${SQLNB_FORMAT_VERSION}.`,
    );
  }

  if (typeof obj.name !== 'string' || obj.name.trim().length === 0) {
    throw new Error('Invalid .sqlnb format: "name" must be a non-empty string.');
  }

  if (!Array.isArray(obj.cells)) {
    throw new Error('Invalid .sqlnb format: "cells" must be an array.');
  }

  for (let i = 0; i < obj.cells.length; i += 1) {
    const cell = obj.cells[i] as Record<string, unknown>;
    if (typeof cell !== 'object' || cell === null) {
      throw new Error(`Invalid .sqlnb format: cell at index ${i} must be an object.`);
    }
    if (cell.type !== 'sql' && cell.type !== 'markdown') {
      throw new Error(
        `Invalid .sqlnb format: cell at index ${i} has invalid type "${String(cell.type)}". Expected "sql" or "markdown".`,
      );
    }
    if (typeof cell.content !== 'string') {
      throw new Error(
        `Invalid .sqlnb format: cell at index ${i} has invalid content. Expected a string.`,
      );
    }
    if (cell.name !== undefined && typeof cell.name !== 'string') {
      throw new Error(
        `Invalid .sqlnb format: cell at index ${i} has invalid name. Expected a string or undefined.`,
      );
    }
  }

  return parsed as SqlnbFormat;
}

/**
 * Triggers a browser file download with the given content.
 */
function downloadFile(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Defer revocation so the browser has time to start the download
  const { href } = link;
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/**
 * Exports a notebook as a .sqlnb JSON file (triggers browser download).
 */
export function exportNotebookAsSqlnb(notebook: Notebook, appVersion: string): void {
  const sqlnb = notebookToSqlnb(notebook, appVersion);
  const json = JSON.stringify(sqlnb, null, 2);
  const fileName = `${sanitizeFileName(notebook.name)}.sqlnb`;
  downloadFile(json, fileName, 'application/json;charset=utf-8');
}

/**
 * Escapes HTML special characters.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Converts basic markdown to HTML.
 * Handles: headers, bold, italic, inline code, code blocks, links, lists, paragraphs.
 */
function markdownToHtml(md: string): string {
  let html = escapeHtml(md);

  // Code blocks (```) — extract and replace with placeholders to protect
  // their content from subsequent inline transformations (bold, italic, etc.)
  const codeBlocks: string[] = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    const placeholder = `\x00CODEBLOCK${codeBlocks.length}\x00`;
    codeBlocks.push(`<pre><code>${code.trim()}</code></pre>`);
    return placeholder;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links: [text](url) — only allow safe URL schemes
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
    if (/^(https?:|mailto:|#)/i.test(url)) {
      return `<a href="${url}">${text}</a>`;
    }
    return text;
  });

  // Unordered lists
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<oli>$1</oli>');
  html = html.replace(/((?:<oli>.*<\/oli>\n?)+)/g, '<ol>$1</ol>');
  // Convert oli placeholders back to li
  html = html.replace(/<oli>/g, '<li>');
  html = html.replace(/<\/oli>/g, '</li>');

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr/>');

  // Line breaks into paragraphs for remaining text
  const lines = html.split('\n');
  const result: string[] = [];
  let inParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith('<h') ||
      trimmed.startsWith('<pre') ||
      trimmed.startsWith('<ul') ||
      trimmed.startsWith('<ol') ||
      trimmed.startsWith('<li') ||
      trimmed.startsWith('<hr') ||
      trimmed.startsWith('</') ||
      trimmed.startsWith('\x00CODEBLOCK') ||
      trimmed.length === 0
    ) {
      if (inParagraph) {
        result.push('</p>');
        inParagraph = false;
      }
      if (trimmed.length > 0) {
        result.push(trimmed);
      }
    } else {
      if (!inParagraph) {
        result.push('<p>');
        inParagraph = true;
      }
      result.push(trimmed);
    }
  }
  if (inParagraph) {
    result.push('</p>');
  }

  // Restore code blocks from placeholders after all block-level processing
  // so that list/paragraph regexes cannot mutate code block content.
  let output = result.join('\n');
  for (let i = 0; i < codeBlocks.length; i += 1) {
    output = output.replace(`\x00CODEBLOCK${i}\x00`, codeBlocks[i]);
  }

  return output;
}

/**
 * Generates a self-contained HTML export of a notebook.
 */
export function notebookToHtml(notebook: Notebook): string {
  const sortedCells = [...notebook.cells].sort((a, b) => a.order - b.order);
  const title = escapeHtml(notebook.name);

  const cellsHtml = sortedCells
    .map((cell, index) => {
      if (cell.type === 'sql') {
        return `
    <div class="cell sql-cell">
      <div class="cell-header">
        <span class="cell-badge sql">SQL</span>
        <span class="cell-number">Cell ${index + 1}</span>
      </div>
      <pre class="sql-code"><code>${escapeHtml(cell.content)}</code></pre>
    </div>`;
      }
      return `
    <div class="cell markdown-cell">
      <div class="cell-header">
        <span class="cell-badge markdown">Markdown</span>
        <span class="cell-number">Cell ${index + 1}</span>
      </div>
      <div class="markdown-content">${markdownToHtml(cell.content)}</div>
    </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    :root {
      --bg-primary: #ffffff;
      --bg-secondary: #f8f9fa;
      --bg-code: #f1f3f5;
      --text-primary: #212529;
      --text-secondary: #868e96;
      --border-color: #dee2e6;
      --accent-sql: #228be6;
      --accent-md: #40c057;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg-primary: #1a1b1e;
        --bg-secondary: #25262b;
        --bg-code: #2c2e33;
        --text-primary: #c1c2c5;
        --text-secondary: #909296;
        --border-color: #373a40;
        --accent-sql: #4dabf7;
        --accent-md: #69db7c;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      padding: 2rem 1rem;
    }
    .container { max-width: 900px; margin: 0 auto; }
    h1.notebook-title {
      font-size: 1.75rem;
      margin-bottom: 0.5rem;
      padding-bottom: 1rem;
      border-bottom: 2px solid var(--border-color);
    }
    .notebook-meta {
      color: var(--text-secondary);
      font-size: 0.85rem;
      margin-bottom: 2rem;
    }
    .cell {
      border: 1px solid var(--border-color);
      border-radius: 8px;
      margin-bottom: 1rem;
      overflow: hidden;
    }
    .cell-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      font-size: 0.8rem;
    }
    .cell-badge {
      display: inline-block;
      padding: 0.1rem 0.5rem;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .cell-badge.sql { background: var(--accent-sql); color: #fff; }
    .cell-badge.markdown { background: var(--accent-md); color: #fff; }
    .cell-number { color: var(--text-secondary); }
    .sql-code {
      margin: 0;
      padding: 1rem;
      background: var(--bg-code);
      overflow-x: auto;
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 0.875rem;
      line-height: 1.5;
      white-space: pre;
    }
    .sql-code code { font-family: inherit; }
    .markdown-content {
      padding: 1rem;
    }
    .markdown-content h1, .markdown-content h2, .markdown-content h3,
    .markdown-content h4, .markdown-content h5, .markdown-content h6 {
      margin-top: 1rem;
      margin-bottom: 0.5rem;
    }
    .markdown-content p { margin-bottom: 0.75rem; }
    .markdown-content code {
      background: var(--bg-code);
      padding: 0.15rem 0.4rem;
      border-radius: 3px;
      font-size: 0.875em;
    }
    .markdown-content pre {
      background: var(--bg-code);
      padding: 1rem;
      border-radius: 6px;
      overflow-x: auto;
      margin: 0.75rem 0;
    }
    .markdown-content pre code { background: none; padding: 0; }
    .markdown-content ul, .markdown-content ol {
      padding-left: 1.5rem;
      margin-bottom: 0.75rem;
    }
    .footer {
      text-align: center;
      color: var(--text-secondary);
      font-size: 0.8rem;
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border-color);
    }
    .footer a { color: var(--accent-sql); text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1 class="notebook-title">${title}</h1>
    <div class="notebook-meta">
      Created: ${escapeHtml(notebook.createdAt)} &middot; ${sortedCells.length} cell${sortedCells.length !== 1 ? 's' : ''}
    </div>
${cellsHtml}
    <div class="footer">
      Generated by <a href="https://pondpilot.io">PondPilot</a>
    </div>
  </div>
</body>
</html>
`;
}

/**
 * Exports a notebook as a self-contained HTML file (triggers browser download).
 */
export function exportNotebookAsHtml(notebook: Notebook): void {
  const html = notebookToHtml(notebook);
  const fileName = `${sanitizeFileName(notebook.name)}.html`;
  downloadFile(html, fileName, 'text/html;charset=utf-8');
}

/**
 * Injects or updates the SQL cell name annotation used by notebook execution.
 * This preserves .sqlnb name metadata on import without changing NotebookCell shape.
 */
function withSqlCellNameAnnotation(content: string, name?: string): string {
  const trimmedName = name?.trim();
  if (!trimmedName) {
    return content;
  }

  const existingName = parseUserCellName(content);
  if (existingName === trimmedName) {
    return content;
  }

  if (existingName) {
    const lines = content.split('\n');
    lines[0] = `-- @name: ${trimmedName}`;
    return lines.join('\n');
  }

  return `-- @name: ${trimmedName}\n${content}`;
}

/**
 * Converts parsed .sqlnb cells into NotebookCell array with generated IDs and order.
 * Requires the cell ID factory to be passed in.
 */
export function sqlnbCellsToNotebookCells(
  sqlnbCells: SqlnbCell[],
  makeCellIdFn: () => NotebookCell['id'],
): NotebookCell[] {
  return sqlnbCells.map((cell, index) => ({
    id: makeCellIdFn(),
    type: cell.type,
    content:
      cell.type === 'sql'
        ? withSqlCellNameAnnotation(cell.content, cell.name)
        : cell.content,
    order: index,
  }));
}
